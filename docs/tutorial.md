# Tutorial — x402-notify

From `git clone` to a paid call returning a real artifact, then to mainnet.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-notify
cd x402-notify
npm install
```

Node 18+ is required (the server uses the built-in `fetch`).

## 2. Configure (optional)

```bash
cp .env.example .env
```

Every value already has a working default, so you can skip this entirely. The two you'll eventually want to change:

```bash
PAY_TO_ADDRESS=0xYourEvmAddress            # where USDC on Base lands
SOLANA_PAY_TO_ADDRESS=YourSolanaAddress    # where USDC on Solana lands
```

Left unset, the server uses the suite's own receive addresses and says so on startup:

```
note: using suite default payTo — set PAY_TO_ADDRESS/SOLANA_PAY_TO_ADDRESS to receive funds yourself
```

### Live delivery (optional, per channel)

**Telegram** — message [@BotFather](https://t.me/botfather), send `/newbot`, copy the token:

```bash
TELEGRAM_BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Email** — any SMTP server will do:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password        # not your login password
SMTP_FROM="Acme Alerts <you@gmail.com>"
```

Each channel is independent. `GET /health` reports both:

```json
{ "channels": { "telegram": "live", "email": "fixture" } }
```

## 3. Run the server

```bash
npm run dev
```

```
x402-notify listening on http://localhost:4025
  data source: fixture
  payment rails:
    evm     base-sepolia   → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402
    solana  solana         → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
  paid routes:
    POST /telegram           $0.002
    POST /email              $0.002
  free routes: GET /health, GET /.well-known/x402
```

Check it's alive — `/health` is free:

```bash
curl -s http://localhost:4025/health
```

## 4. Your first 402

Call a paid route with no payment:

```bash
curl -i -X POST http://localhost:4025/telegram \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"123456789","text":"Deploy finished - all 412 tests green."}'
```

You get `HTTP/1.1 402 Payment Required` and a body listing **both** rails:

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

Read it as: *"pay $0.002 of USDC to one of these two addresses, on whichever chain you prefer, then ask again."* `maxAmountRequired` is in atomic units — USDC has 6 decimals, so `"2000"` is `$0.002`.

## 5. Pay for it

### EVM (Base) — `x402-fetch`

The included client does the whole dance. Give it a funded key:

```bash
# A base-sepolia key with testnet USDC. Faucet: https://faucet.circle.com
export PRIVATE_KEY=0xYourTestnetPrivateKey
npm run client
```

`wrapFetchWithPayment` catches the 402, signs an EIP-3009 USDC authorization for the amount quoted, and replays the request with the `X-PAYMENT` header. You never write the retry loop.

### Solana

A Solana wallet signs a serialized SPL transfer rather than typed data, so the server exposes two helpers:

```bash
# 1. Ask for the transaction that satisfies the Solana accept
curl -s -X POST 'http://localhost:4025/api/x402-checkout?action=prepare' \
  -H 'content-type: application/json' \
  -d '{"accept": <the solana entry from the 402 body>, "buyer": "<your base58 pubkey>"}'
# → { "tx_base64": "...", "recent_blockhash": "..." }

# 2. Sign tx_base64 with your wallet, then wrap it into an X-PAYMENT header
curl -s -X POST 'http://localhost:4025/api/x402-checkout?action=encode' \
  -H 'content-type: application/json' \
  -d '{"accept": <same accept>, "signed_tx_base64": "<signed>", "resource_url": "<the resource field>"}'
# → { "x_payment": "..." }
```

Then retry the original request with `X-PAYMENT: <x_payment>`. In a browser, [`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal) does all of this from a single `<button>`.

## 6. Read the artifact

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

Two things to notice:

- **The artifact is in the body.** There's no job id to poll and no webhook to wait for — the thing you paid for is right there.
- **`payment` is your receipt.** It repeats the `X-PAYMENT-RESPONSE` header: which rail settled, the transaction hash or signature, and who paid. Log it; it's your proof of purchase.

Two fields decide everything an agent needs to know:

- **`delivered`** — `true` only when the message actually left. A dry run is `false` and carries `dryRunReason`.
- **`receipt.smtpResponse`** (email) — the literal line the receiving server returned, e.g. `250 2.0.0 OK 1738012345 x1-20020a05 - gsmtp`. That's the strongest delivery evidence SMTP offers, and it's yours in the response body.

For Telegram, `messageId` plus `chat.id` is a permanent handle: an agent can use it later to edit, reply to, or delete the message it sent.

## 7. Go to mainnet

Testnet USDC is fine for development. For real money:

```bash
NETWORK=base                                   # EVM rail → Base mainnet
FACILITATOR_URL=https://facilitator.payai.network   # x402.org only settles base-sepolia
SOLANA_NETWORK=mainnet-beta                    # already the default
SOLANA_RPC_URL=https://your-dedicated-rpc      # the public RPC is rate-limited
PAY_TO_ADDRESS=0xYourEvmAddress
SOLANA_PAY_TO_ADDRESS=YourSolanaAddress
```

Then deploy anywhere that runs Node, set `PUBLIC_BASE_URL` to your public origin so the 402 `resource` field is right, and submit that origin to [x402scan.com](https://x402scan.com) / the x402 Bazaar / [agentic.market](https://agentic.market) — they read `/.well-known/x402` and list you automatically.

## Next

- [API reference](api.md) — every parameter and response field
- [For AI agents](agents.md) — discovery, MCP, and the skill.md contract
- [`examples/curl.md`](https://github.com/nirholas/x402-notify/blob/main/examples/curl.md) — the raw HTTP walkthrough
