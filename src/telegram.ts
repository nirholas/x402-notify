// Live Telegram Bot API adapter — used when TELEGRAM_BOT_TOKEN is set.
// Docs: https://core.telegram.org/bots/api  (a bot token is free from @BotFather)
//
// Without a token, src/service.ts falls back to a deterministic dry run and
// labels the response `source: "fixture"`. Nothing is ever silently swallowed.

export interface TelegramDelivery {
  messageId: number;
  chat: { id: string | number; type: string; title: string | null; username: string | null };
  deliveredAt: string;
  /** Telegram's own send timestamp, unix seconds. */
  date: number | null;
}

const TELEGRAM_BASE = process.env.TELEGRAM_BASE_URL ?? "https://api.telegram.org";

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export class TelegramError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 502, code = "upstream_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface TelegramResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  result?: {
    message_id: number;
    date: number;
    chat: { id: number; type: string; title?: string; username?: string };
  };
}

export async function telegramSend(args: {
  chatId: string;
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  disableNotification?: boolean;
  disableWebPagePreview?: boolean;
}): Promise<TelegramDelivery> {
  const url = `${TELEGRAM_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: args.text,
        parse_mode: args.parseMode,
        disable_notification: args.disableNotification ?? false,
        link_preview_options: args.disableWebPagePreview ? { is_disabled: true } : undefined,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new TelegramError(`Telegram API unreachable: ${(err as Error).message}`);
  }

  const data = (await res.json().catch(() => ({ ok: false }))) as TelegramResponse;

  if (!data.ok || !data.result) {
    const description = data.description ?? `status ${res.status}`;
    // 400/403 are "your chat id or your text is wrong" — a caller problem, and
    // the caller paid, so the message has to name the actual cause.
    const isCallerError = res.status === 400 || res.status === 403;
    throw new TelegramError(
      `Telegram rejected the message: ${description}`,
      isCallerError ? 400 : 502,
      isCallerError ? "delivery_rejected" : "upstream_error",
    );
  }

  const chat = data.result.chat;
  return {
    messageId: data.result.message_id,
    chat: {
      id: chat.id,
      type: chat.type,
      title: chat.title ?? null,
      username: chat.username ?? null,
    },
    deliveredAt: new Date(data.result.date * 1000).toISOString(),
    date: data.result.date,
  };
}
