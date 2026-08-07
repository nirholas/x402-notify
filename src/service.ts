import { createHash } from "node:crypto";
import { telegramConfigured, telegramSend, TelegramError, type TelegramDelivery } from "./telegram.js";
import {
  smtpConfigured,
  smtpFromAddress,
  smtpSend,
  SmtpError,
  type SmtpDelivery,
} from "./smtp.js";

export type Source = "live" | "fixture";

export class ServiceError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface TelegramResult {
  source: Source;
  channel: "telegram";
  delivered: boolean;
  messageId: number;
  chat: { id: string | number; type: string; title: string | null; username: string | null };
  deliveredAt: string;
  textLength: number;
  parseMode: string | null;
  silent: boolean;
  /** Present only in fixture mode: why nothing was actually sent. */
  dryRunReason?: string;
}

export interface EmailResult {
  source: Source;
  channel: "email";
  delivered: boolean;
  /** The SMTP acceptance receipt — the point of this endpoint. */
  receipt: {
    messageId: string;
    smtpResponse: string;
    smtpCode: number | null;
    host: string;
    acceptedAt: string;
  };
  accepted: string[];
  rejected: string[];
  envelope: { from: string; to: string[] };
  subject: string;
  bodyBytes: number;
  dryRunReason?: string;
}

export function telegramSource(): Source {
  return telegramConfigured() ? "live" : "fixture";
}

export function emailSource(): Source {
  return smtpConfigured() ? "live" : "fixture";
}

function toServiceError(err: unknown): ServiceError {
  if (err instanceof ServiceError) return err;
  if (err instanceof TelegramError || err instanceof SmtpError) {
    return new ServiceError(err.code, err.message, err.status);
  }
  return new ServiceError("upstream_error", (err as Error).message, 502);
}

/** Stable pseudo-id derived from the payload, so a dry run is reproducible. */
function fixtureId(payload: unknown, mod: number): number {
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 8);
  return (parseInt(digest, 16) % mod) + 1;
}

// ────────────────────────────────────────────────────────────── Telegram ─────

export interface TelegramRequest {
  chatId?: unknown;
  text?: unknown;
  parseMode?: unknown;
  silent?: unknown;
  disableWebPagePreview?: unknown;
}

const PARSE_MODES = ["Markdown", "MarkdownV2", "HTML"] as const;

export async function sendTelegram(req: TelegramRequest): Promise<TelegramResult> {
  const chatId = typeof req.chatId === "string" || typeof req.chatId === "number" ? String(req.chatId).trim() : "";
  if (!chatId) {
    throw new ServiceError(
      "missing_chat_id",
      "`chatId` is required — a numeric chat id, or an @channelusername the bot can post to",
    );
  }
  const text = typeof req.text === "string" ? req.text : "";
  if (!text.trim()) throw new ServiceError("missing_text", "`text` is required");
  if (text.length > 4096) {
    throw new ServiceError(
      "text_too_long",
      `\`text\` is ${text.length} characters; Telegram's limit for a single message is 4096`,
    );
  }
  const parseMode = (PARSE_MODES as readonly string[]).includes(String(req.parseMode))
    ? (String(req.parseMode) as (typeof PARSE_MODES)[number])
    : undefined;
  const silent = req.silent === true;

  const source = telegramSource();

  if (source === "live") {
    let delivery: TelegramDelivery;
    try {
      delivery = await telegramSend({
        chatId,
        text,
        parseMode,
        disableNotification: silent,
        disableWebPagePreview: req.disableWebPagePreview === true,
      });
    } catch (err) {
      throw toServiceError(err);
    }
    return {
      source,
      channel: "telegram",
      delivered: true,
      messageId: delivery.messageId,
      chat: delivery.chat,
      deliveredAt: delivery.deliveredAt,
      textLength: text.length,
      parseMode: parseMode ?? null,
      silent,
    };
  }

  // ── Dry run ───────────────────────────────────────────────────────────────
  // No token, so nothing is sent. Say so plainly in the body rather than
  // returning a success that isn't one.
  return {
    source,
    channel: "telegram",
    delivered: false,
    messageId: fixtureId({ chatId, text }, 900_000),
    chat: {
      id: /^-?\d+$/.test(chatId) ? Number(chatId) : chatId,
      type: chatId.startsWith("@") ? "channel" : Number(chatId) < 0 ? "group" : "private",
      title: null,
      username: chatId.startsWith("@") ? chatId.slice(1) : null,
    },
    deliveredAt: new Date().toISOString(),
    textLength: text.length,
    parseMode: parseMode ?? null,
    silent,
    dryRunReason:
      "TELEGRAM_BOT_TOKEN is not set, so no message was sent. The request was validated exactly as a live send would be, and this is the receipt shape you will get once a token is configured.",
  };
}

// ───────────────────────────────────────────────────────────────── Email ─────

export interface EmailRequest {
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  from?: unknown;
  replyTo?: unknown;
  cc?: unknown;
  bcc?: unknown;
}

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

function addressList(value: unknown, field: string, required: boolean): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const list = raw.map((v) => String(v).trim()).filter(Boolean);
  if (list.length === 0) {
    if (required) throw new ServiceError("missing_recipient", `\`${field}\` is required`);
    return [];
  }
  if (list.length > 50) {
    throw new ServiceError("too_many_recipients", `\`${field}\` has ${list.length} addresses; the maximum is 50`);
  }
  for (const address of list) {
    if (!EMAIL_RE.test(address)) {
      throw new ServiceError("invalid_recipient", `\`${address}\` is not a valid email address`);
    }
  }
  return list;
}

export async function sendEmail(req: EmailRequest): Promise<EmailResult> {
  const to = addressList(req.to, "to", true);
  const cc = addressList(req.cc, "cc", false);
  const bcc = addressList(req.bcc, "bcc", false);
  const subject = typeof req.subject === "string" ? req.subject.trim() : "";
  if (!subject) throw new ServiceError("missing_subject", "`subject` is required");
  if (subject.length > 998) {
    throw new ServiceError("subject_too_long", "`subject` exceeds the 998-character RFC 5322 header limit");
  }
  const text = typeof req.text === "string" ? req.text : undefined;
  const html = typeof req.html === "string" ? req.html : undefined;
  if (!text && !html) {
    throw new ServiceError("missing_body", "Provide `text`, `html`, or both");
  }
  const from = typeof req.from === "string" && req.from.trim() ? req.from.trim() : smtpFromAddress();
  const replyTo = typeof req.replyTo === "string" ? req.replyTo.trim() : undefined;
  const bodyBytes = Buffer.byteLength(html ?? text ?? "", "utf8");

  const source = emailSource();

  if (source === "live") {
    let delivery: SmtpDelivery;
    try {
      delivery = await smtpSend({ to, cc, bcc, subject, text, html, from, replyTo });
    } catch (err) {
      throw toServiceError(err);
    }
    return {
      source,
      channel: "email",
      // The server took the message only if it accepted at least one recipient.
      delivered: delivery.accepted.length > 0,
      receipt: {
        messageId: delivery.messageId,
        smtpResponse: delivery.smtpResponse,
        smtpCode: delivery.smtpCode,
        host: delivery.host,
        acceptedAt: delivery.acceptedAt,
      },
      accepted: delivery.accepted,
      rejected: delivery.rejected,
      envelope: delivery.envelope,
      subject,
      bodyBytes,
    };
  }

  // ── Dry run ───────────────────────────────────────────────────────────────
  const domain = (from.split("@")[1] ?? "localhost").replace(/[^a-zA-Z0-9.-]/g, "");
  const stamp = fixtureId({ to, subject, text, html }, 9_000_000);
  return {
    source,
    channel: "email",
    delivered: false,
    receipt: {
      messageId: `<${stamp.toString(16)}.x402-notify@${domain}>`,
      smtpResponse: "250 2.0.0 OK (dry run — SMTP_HOST is not configured)",
      smtpCode: 250,
      host: "",
      acceptedAt: new Date().toISOString(),
    },
    accepted: to,
    rejected: [],
    envelope: { from, to: [...to, ...cc, ...bcc] },
    subject,
    bodyBytes,
    dryRunReason:
      "SMTP_HOST is not set, so no mail was relayed. The request was validated exactly as a live send would be, and this is the receipt shape you will get once SMTP is configured.",
  };
}
