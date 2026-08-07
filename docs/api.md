# API reference — x402-notify

Base URL: `http://localhost:4025` locally, or your deployment's origin.

All paid routes answer `402` when called without an `X-PAYMENT` header, and the 402 body lists **both** payment rails. See [tutorial.md](tutorial.md) for the end-to-end flow and [agents.md](agents.md) for the agent integration.

---

## `POST /telegram`

**$0.002** · Deliver one Telegram message to a chat, group or channel.

Posts through a Telegram bot. `chatId` is a numeric chat id (negative for groups) or an `@channelusername` the bot administers. Returns the permanent `messageId` and the chat as Telegram resolved it — type, title and username — so an agent can act on the message it just sent.

`parseMode` is `Markdown`, `MarkdownV2` or `HTML`; omit it for plain text. `silent: true` delivers without a notification sound.

### Request body

```json
{
  "chatId": "123456789",
  "text": "Deploy finished - all 412 tests green.",
  "parseMode": "Markdown",
  "silent": false
}
```

### Example

```bash
curl -s -X POST http://localhost:4025/telegram \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"123456789","text":"Deploy finished - all 412 tests green.","parseMode":"Markdown"}'
```

### Response `200`

`{messageId, chat, deliveredAt}` — the message id and the chat Telegram resolved, usable later to reply to or edit the message. The `payment` field mirrors the `X-PAYMENT-RESPONSE` header.

```json
{
  "source": "fixture",
  "channel": "telegram",
  "delivered": false,
  "messageId": 188435,
  "chat": {
    "id": 123456789,
    "type": "private",
    "title": null,
    "username": null
  },
  "deliveredAt": "2026-08-07T12:00:00.000Z",
  "textLength": 38,
  "parseMode": "Markdown",
  "silent": false,
  "dryRunReason": "TELEGRAM_BOT_TOKEN is not set, so no message was sent. The request was validated exactly as a live send would be, and this is the receipt shape you will get once a token is configured.",
  "payment": {
    "success": true,
    "rail": "evm",
    "network": "base-sepolia",
    "transaction": "0x9c1f…",
    "payer": "0xA11ce…",
    "amount": "2000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "resource": "http://localhost:4025/telegram"
  }
}
```

### Errors

`400 missing_chat_id` / `missing_text` for an incomplete request. `400 text_too_long` above Telegram's 4,096-character single-message limit. `400 delivery_rejected` when Telegram refuses — the message quotes Telegram's own `description`, usually "chat not found" (wrong id) or "bot was blocked by the user". With no token configured you get `200` with `delivered: false` and a `dryRunReason`, never a false success.

---

## `POST /email`

**$0.002** · Relay one email over SMTP and return the server's acceptance receipt.

Relays through any SMTP server and returns the strongest delivery evidence SMTP offers: the literal reply the receiving server gave when it took responsibility for the message. `to`, `cc` and `bcc` accept a single address, a comma-separated string, or an array (up to 50 each). Provide `text`, `html`, or both — the receiving client picks.

A multi-recipient send is one call and one payment. `accepted` and `rejected` split the recipient list the way the server actually answered, so a partial acceptance is visible rather than hidden behind a single boolean.

### Request body

```json
{
  "to": [
    "dana@example.com"
  ],
  "subject": "Deploy finished",
  "text": "All 412 tests green. Released v2.4.0 to production.",
  "from": "Acme Alerts <alerts@acme.example>"
}
```

### Example

```bash
curl -s -X POST http://localhost:4025/email \
  -H 'Content-Type: application/json' \
  -d '{
    "to": ["dana@example.com"],
    "subject": "Deploy finished",
    "text": "All 412 tests green. Released v2.4.0 to production."
  }'
```

### Response `200`

the SMTP acceptance receipt — raw `250 …` response, reply code, Message-ID, host — plus accepted/rejected recipients and the envelope as sent. The `payment` field mirrors the `X-PAYMENT-RESPONSE` header.

```json
{
  "source": "fixture",
  "channel": "email",
  "delivered": false,
  "receipt": {
    "messageId": "<51ecc5.x402-notify@acme.example>",
    "smtpResponse": "250 2.0.0 OK (dry run — SMTP_HOST is not configured)",
    "smtpCode": 250,
    "host": "",
    "acceptedAt": "2026-08-07T12:00:00.000Z"
  },
  "accepted": [
    "dana@example.com"
  ],
  "rejected": [],
  "envelope": {
    "from": "Acme Alerts <alerts@acme.example>",
    "to": [
      "dana@example.com"
    ]
  },
  "subject": "Deploy finished",
  "bodyBytes": 51,
  "dryRunReason": "SMTP_HOST is not set, so no mail was relayed. The request was validated exactly as a live send would be, and this is the receipt shape you will get once SMTP is configured.",
  "payment": {
    "success": true,
    "rail": "solana",
    "network": "solana",
    "transaction": "5xkQ…",
    "payer": "9wFh…",
    "amount": "2000",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "resource": "http://localhost:4025/email"
  }
}
```

### Errors

`400 missing_recipient` / `missing_subject` / `missing_body` for an incomplete request. `400 invalid_recipient` names the offending address. `400 too_many_recipients` above 50 per field. `400 delivery_rejected` when the server answers 5xx — the message carries the server's own reply line, so you can see whether it was a bad mailbox or a rejected sender. `502 upstream_error` when the server is unreachable; you were charged for the attempt, so the error names the host and the failure.

---

## Free routes

### `GET /health`

```json
{
  "ok": true,
  "service": "x402-notify",
  "source": "fixture",
  "rails": [
    { "rail": "evm", "network": "base-sepolia" },
    { "rail": "solana", "network": "solana" }
  ]
}
```

### `GET /.well-known/x402`

The discovery manifest. Every resource entry carries its price and an `accepts` array with both rails. This is what [x402scan.com](https://x402scan.com), the x402 Bazaar and [agentic.market](https://agentic.market) index.

---

## The 402 challenge

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "2000",
      "resource": "http://localhost:4025/telegram",
      "description": "Deliver one Telegram message to a chat, group or channel.",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "2000",
      "resource": "http://localhost:4025/telegram",
      "description": "Deliver one Telegram message to a chat, group or channel.",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 60,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": {
        "name": "USD Coin",
        "decimals": 6,
        "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
        "amount": "2000"
      }
    }
  ]
}
```

Amounts are USDC atomic units (6 decimals): `"2000"` is `$0.002`.

## Settlement receipt

Successful paid responses carry `X-PAYMENT-RESPONSE`, base64 JSON:

```json
{
  "success": true,
  "rail": "evm",
  "network": "base-sepolia",
  "transaction": "0x…",
  "payer": "0x…",
  "amount": "2000",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "resource": "http://localhost:4025/telegram"
}
```

The same object is echoed in the response body's `payment` field, so an agent that only reads JSON still gets its receipt.

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `missing_chat_id` | 400 | `POST /telegram` called without `chatId` |
| `missing_text` | 400 | `POST /telegram` called without `text` |
| `text_too_long` | 400 | Telegram text exceeds 4,096 characters |
| `missing_recipient` | 400 | `POST /email` called without `to` |
| `invalid_recipient` | 400 | An address in `to`, `cc` or `bcc` isn't a valid email address |
| `too_many_recipients` | 400 | More than 50 addresses in one field |
| `missing_subject` | 400 | `POST /email` called without `subject` |
| `missing_body` | 400 | `POST /email` called with neither `text` nor `html` |
| `delivery_rejected` | 400 | Telegram or the SMTP server refused the message — the message quotes the provider's exact reason |
| `upstream_error` | 502 | The provider was unreachable or failed unexpectedly |
| `no_payment_rail` | 500 | Neither rail is configured on this instance |
| `facilitator_unreachable` | 502 | The rail's facilitator could not be reached to verify the payment |
| `settlement_error` | 502 | The payment verified but settlement failed — you were not charged |
