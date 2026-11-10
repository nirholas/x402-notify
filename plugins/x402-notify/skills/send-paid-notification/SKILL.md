---
name: send-paid-notification
description: Run the x402-notify HTTP service and send one Telegram message or one email per paid call, getting the delivery receipt in the response. Use when an agent must notify a person and can pay per message in USDC over x402.
---

# x402-notify

x402-notify sends one message per paid call. `POST /telegram` posts through a bot and returns `{messageId, chat, deliveredAt}`. `POST /email` relays over SMTP and returns the server's `250` acceptance line, `messageId` and accepted and rejected recipients. Responses carry `delivered` and `source` fields, so a dry run (no channel configured) is never mistaken for a delivery.

Paying is irreversible. Before any paid call, show the user the route, price, network and payTo address from the 402 response, and wait for an explicit yes.

## Run the service

From a clone (Node 18+):

```bash
git clone https://github.com/nirholas/x402-notify
cd x402-notify && npm install
npm run dev        # tsx src/server.ts, listens on :4025 (PORT overrides)
```

Environment (see `.env.example`): `TELEGRAM_BOT_TOKEN` (from @BotFather; unset means `/telegram` is a validated dry run), `TELEGRAM_BASE_URL`, `SMTP_HOST` (unset means `/email` is a dry run), `SMTP_PORT` (587 STARTTLS, 465 implicit TLS), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`. Payment settings: `PAY_TO_ADDRESS` (Base receive address), `SOLANA_PAY_TO_ADDRESS`, `NETWORK` (`base-sepolia` default, or `base`), `SOLANA_NETWORK`, `FACILITATOR_URL`, `PUBLIC_BASE_URL`. Set your own pay-to addresses to be paid yourself. `npm run build` then `npm start` runs the compiled server.

## Routes

| Route | Price | Body |
|---|---|---|
| `POST /telegram` | $0.002 | `chatId` (numeric id, negative for groups, or `@channelusername` the bot administers), `text`, optional `parseMode` (`Markdown`, `MarkdownV2`, `HTML`), `silent` |
| `POST /email` | $0.002 | `to` (string, comma list or array, up to 50; `cc` and `bcc` likewise), `subject`, `text` and/or `html`, optional `from` |
| `GET /health`, `GET /.well-known/x402` | free | liveness and rails, discovery manifest |

## Paying

An unpaid request to a paid route returns 402 with an `accepts` array listing both rails (USDC on Base or Solana). Sign the entry your wallet supports and retry with the base64 `X-PAYMENT` header. The settlement receipt is in the `X-PAYMENT-RESPONSE` header. The reference client is `examples/agent-client.ts` (`npm run client`), which uses `x402-fetch` with `PRIVATE_KEY` for a Base Sepolia wallet and `BASE_URL` (default `http://localhost:4025`).

Sending a message is itself irreversible: confirm the recipient and text with the user, as well as the price, before the paid call.

## Example

```bash
curl -i -X POST localhost:4025/email -H 'content-type: application/json' \
  -d '{"to":["dana@example.com"],"subject":"Deploy finished","text":"All 412 tests green."}'
# 402 first. After approval and payment the 200 body has smtpResponse, smtpCode, messageId,
# accepted, rejected and delivered.
```
