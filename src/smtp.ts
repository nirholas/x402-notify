// Live SMTP adapter — used when SMTP_HOST is set.
// Works with any SMTP server: Gmail app passwords, Postmark, SES, Mailtrap,
// Resend's SMTP bridge, or a local relay.
//
// The artifact this endpoint sells is the **SMTP acceptance receipt**: the exact
// line the receiving server returned when it took responsibility for the message
// (`250 2.0.0 OK 1738…`), together with the Message-ID and the per-recipient
// accepted/rejected split. That is the strongest delivery evidence SMTP offers,
// and it comes back in the 200 body.

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface SmtpDelivery {
  messageId: string;
  /** Raw SMTP reply from the receiving server — the acceptance receipt. */
  smtpResponse: string;
  /** SMTP reply code parsed out of the response, e.g. 250. */
  smtpCode: number | null;
  accepted: string[];
  rejected: string[];
  envelope: { from: string; to: string[] };
  host: string;
  acceptedAt: string;
}

export class SmtpError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 502, code = "upstream_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function smtpFromAddress(): string {
  return process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "no-reply@localhost";
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT ?? 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Implicit TLS on 465; STARTTLS is negotiated on everything else.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });
  return transporter;
}

export async function smtpSend(args: {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}): Promise<SmtpDelivery> {
  const from = args.from ?? smtpFromAddress();
  let info: {
    messageId: string;
    response: string;
    accepted: Array<string | { address: string }>;
    rejected: Array<string | { address: string }>;
    envelope: { from: string; to: string[] };
  };

  try {
    info = (await getTransporter().sendMail({
      from,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      replyTo: args.replyTo,
      subject: args.subject,
      text: args.text,
      html: args.html,
    })) as typeof info;
  } catch (err) {
    const e = err as Error & { responseCode?: number; response?: string };
    // 5xx from the server means the message itself is wrong (bad recipient, bad
    // sender). That's the caller's problem and they should see the real reason.
    const isCallerError = typeof e.responseCode === "number" && e.responseCode >= 500 && e.responseCode < 600;
    throw new SmtpError(
      `SMTP send failed: ${e.response ?? e.message}`,
      isCallerError ? 400 : 502,
      isCallerError ? "delivery_rejected" : "upstream_error",
    );
  }

  const addr = (a: string | { address: string }): string => (typeof a === "string" ? a : a.address);
  const codeMatch = /^(\d{3})/.exec(info.response ?? "");

  return {
    messageId: info.messageId,
    smtpResponse: info.response ?? "",
    smtpCode: codeMatch ? Number(codeMatch[1]) : null,
    accepted: (info.accepted ?? []).map(addr),
    rejected: (info.rejected ?? []).map(addr),
    envelope: { from: info.envelope?.from ?? from, to: info.envelope?.to ?? args.to },
    host: process.env.SMTP_HOST ?? "",
    acceptedAt: new Date().toISOString(),
  };
}
