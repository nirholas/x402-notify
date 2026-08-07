# x402-notify

x402-notify gives an agent a way to send one message and pay for exactly that message. `POST /telegram` posts to a chat, group or channel through a bot and returns `{messageId, chat, deliveredAt}` with the chat type and title resolved by Telegram. `POST /email` relays over any SMTP server and returns the acceptance receipt: `smtpResponse` (the raw `250 …` line), `smtpCode`, the RFC 5322 `messageId`, the accepted and rejected recipient lists, and the envelope as sent. Both endpoints validate the request exactly the same way whether or not a channel is configured, and both carry a `delivered` boolean plus a `source` field so a caller can never mistake a dry run for a delivery.

**Base URL:** `{BASE_URL}` (local default `http://localhost:4025`)

## Endpoints

### `POST /telegram` — $0.002

Posts through a Telegram bot. `chatId` is a numeric chat id (negative for groups) or an `@channelusername` the bot administers. Returns the permanent `messageId` and the chat as Telegram resolved it — type, title and username — so an agent can act on the message it just sent.

`parseMode` is `Markdown`, `MarkdownV2` or `HTML`; omit it for plain text. `silent: true` delivers without a notification sound.

Request body:

```json
{
  "chatId": "123456789",
  "text": "Deploy finished - all 412 tests green.",
  "parseMode": "Markdown",
  "silent": false
}
```

Returns `{messageId, chat, deliveredAt}` — the message id and the chat Telegram resolved, usable later to reply to or edit the message:

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

### `POST /email` — $0.002

Relays through any SMTP server and returns the strongest delivery evidence SMTP offers: the literal reply the receiving server gave when it took responsibility for the message. `to`, `cc` and `bcc` accept a single address, a comma-separated string, or an array (up to 50 each). Provide `text`, `html`, or both — the receiving client picks.

A multi-recipient send is one call and one payment. `accepted` and `rejected` split the recipient list the way the server actually answered, so a partial acceptance is visible rather than hidden behind a single boolean.

Request body:

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

Returns the SMTP acceptance receipt — raw `250 …` response, reply code, Message-ID, host — plus accepted/rejected recipients and the envelope as sent:

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

### Free routes

| Route | Returns |
|---|---|
| `GET /health` | `{ok, service, source, rails}` — liveness plus the rails this instance advertises |
| `GET /.well-known/x402` | The discovery manifest below |

## Payment

This service speaks **x402** (HTTP 402 payment protocol, <https://x402.org>). **Pay in USDC on Base or Solana — your client picks the rail.**

1. Call the endpoint normally. With no `X-PAYMENT` header you get `402` and a JSON body with an `accepts` array holding **both** rails.
2. Pick a rail, produce a payment for it, and retry the identical request with the base64 `X-PAYMENT` header.
3. You get `200` with the artifact **in the response body**, plus an `X-PAYMENT-RESPONSE` header carrying the settlement receipt (tx hash / signature + rail). The same receipt is echoed in the body's `payment` field.

| Rail | Network | Asset | payTo | Facilitator |
|---|---|---|---|---|
| EVM | `base-sepolia` (or `base`) | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `https://x402.org/facilitator` |
| Solana | `solana` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `https://facilitator.payai.network` |

Pay via [`x402-fetch`](https://www.npmjs.com/package/x402-fetch) (EVM), [`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal) (browser, both rails), or any x402 client. Solana wallets that sign serialized transactions can use this server's helper endpoints:

```
POST /api/x402-checkout?action=prepare   → unsigned SPL transfer for a chosen accept
POST /api/x402-checkout?action=encode    → wraps your signed tx into an X-PAYMENT header
```

The Solana `extra.feePayer` sponsor pays the SOL network fee, so you need only USDC.

## Errors

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
| `facilitator_unreachable` | 502 | The rail's facilitator could not be reached to verify |
| `settlement_error` | 502 | Verified, but settlement failed — you were not charged |

## Data source

Telegram delivers for real when `TELEGRAM_BOT_TOKEN` is set (a free token from @BotFather). Email relays for real when `SMTP_HOST` is set (any server: Gmail app password, Postmark, SES, Mailtrap, a local relay). Each channel is independent — you can run one live and one dry. Unconfigured channels return `"source": "fixture"`, `"delivered": false` and a `dryRunReason` explaining exactly what was skipped. **Nothing ever reports a delivery that didn't happen.**

## Discovery

- Manifest: `{BASE_URL}/.well-known/x402`
- OpenAPI: [`openapi.json`](https://github.com/nirholas/x402-notify/blob/main/openapi.json)
- Docs: <https://nirholas.github.io/x402-notify/>
- Contact: nichxbt@gmail.com
