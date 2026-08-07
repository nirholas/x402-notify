# Raw HTTP walkthrough — x402-notify

The full 402 → pay → 200 flow with nothing but `curl`. Start the server first:

```bash
npm run dev   # http://localhost:4025
```

## 0. Free routes need no payment

```bash
curl -s http://localhost:4025/health
curl -s http://localhost:4025/.well-known/x402
```

## 1. Ask without paying → `402`

```bash
curl -i -X POST http://localhost:4025/telegram \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"123456789","text":"Deploy finished - all 412 tests green."}'
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
```

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

**Both rails, one challenge.** Pick either entry:

- the `base-sepolia` entry → sign an EIP-3009 USDC authorization
- the `solana` entry → sign an SPL `transferChecked`

`maxAmountRequired` is in USDC atomic units (6 decimals), so `"2000"` = `$0.002`.

## 2a. Pay on Base (EVM)

The EIP-3009 signature is produced by your wallet, so this step isn't a `curl`. The payload you base64-encode into `X-PAYMENT` looks like:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x…",
    "authorization": {
      "from": "0xYourWallet",
      "to": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "value": "2000",
      "validAfter": "0",
      "validBefore": "1893456000",
      "nonce": "0x…"
    }
  }
}
```

```bash
X_PAYMENT=$(printf '%s' "$PAYLOAD_JSON" | base64 -w0)
```

In practice let [`x402-fetch`](https://www.npmjs.com/package/x402-fetch) build it — see [`agent-client.ts`](agent-client.ts).

## 2b. Pay on Solana

Solana wallets sign serialized transactions, so the server builds one:

```bash
# Save the solana accept from step 1
ACCEPT='{"scheme":"exact","network":"solana","amount":"2000","asset":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","payTo":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW","extra":{"name":"USD Coin","decimals":6,"feePayer":"2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"}}'

# Build the unsigned transfer
curl -s -X POST 'http://localhost:4025/api/x402-checkout?action=prepare' \
  -H 'content-type: application/json' \
  -d "{\"accept\": $ACCEPT, \"buyer\": \"YOUR_BASE58_PUBKEY\"}"
# → { "network": "solana", "tx_base64": "…", "recent_blockhash": "…" }

# …sign tx_base64 in your wallet, then wrap it…
curl -s -X POST 'http://localhost:4025/api/x402-checkout?action=encode' \
  -H 'content-type: application/json' \
  -d "{\"accept\": $ACCEPT, \"signed_tx_base64\": \"SIGNED_TX\", \"resource_url\": \"http://localhost:4025/telegram\"}"
# → { "x_payment": "…" }
```

The `feePayer` sponsor pays the SOL network fee — you only need USDC.

## 3. Retry with the header → `200`

```bash
curl -sD - -X POST http://localhost:4025/telegram \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"123456789","text":"Deploy finished - all 412 tests green.","parseMode":"Markdown"}'
```

```http
HTTP/1.1 200 OK
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJyYWlsIjoiZXZtIiwi…
```

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

Decode the receipt header:

```bash
echo "$RESPONSE_HEADER" | base64 -d
# {"success":true,"rail":"evm","network":"base-sepolia","transaction":"0x…","payer":"0x…"}
```

The same object is in the body's `payment` field, so you can skip the header entirely.

## Other routes

### `POST /email` — $0.002

```bash
curl -s -X POST http://localhost:4025/email \
  -H 'Content-Type: application/json' \
  -d '{
    "to": ["dana@example.com"],
    "subject": "Deploy finished",
    "text": "All 412 tests green. Released v2.4.0 to production."
  }'
```

## Errors you may hit

| Body `error` | HTTP | Fix |
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
| `facilitator_unreachable` | 502 | The facilitator is down or unreachable — retry; you were not charged |
