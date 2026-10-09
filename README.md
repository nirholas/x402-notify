# x402-notify

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![x402](https://img.shields.io/badge/x402-payment%20protocol-0052ff)](https://x402.org)
[![USDC on Base + Solana](https://img.shields.io/badge/USDC-Base%20%2B%20Solana-2775ca)](https://x402.org)

> One message, one payment, one receipt — Telegram and SMTP email delivered per-message with the proof of delivery in the response.

`POST /telegram` delivers a message through a Telegram bot and returns the message id, the resolved chat, and the delivery timestamp. `POST /email` relays a message over SMTP and returns the **acceptance receipt** — the literal line the receiving server sent back when it took responsibility for the message, plus the Message-ID and the per-recipient accepted/rejected split. Both cost $0.002 and both put the receipt in the 200 body.

## Why x402 for this

Notification providers sell in blocks: a monthly plan, a bundle of credits, a minimum commitment. An agent that needs to send eleven messages this month shouldn't be buying ten thousand. x402 prices a message at $0.002 and settles it in USDC at send time, so cost tracks sends exactly. And because the settlement receipt and the delivery receipt come back in the same response, the record of *what you paid for* and *what was delivered* is a single object.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-notify
cd x402-notify
npm install
npm run dev          # http://localhost:4025
```

No configuration needed — the server ships with the suite's receive addresses and a dry-run mode that validates the request exactly as a live send would and returns the same receipt shape, so the demo works before you have a bot token or an SMTP server. Set `PAY_TO_ADDRESS` / `SOLANA_PAY_TO_ADDRESS` to receive funds yourself.

```bash
# 1. Unpaid → 402 listing both rails
curl -i -X POST http://localhost:4025/telegram \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"123456789","text":"Deploy finished - all 412 tests green."}'

# 2. Paid, via any x402 client
npm run client
```

## API

| Route | Price | What you get back |
|---|---|---|
| `POST /telegram` | **$0.002** | `{messageId, chat, deliveredAt}` — the message id and the chat Telegram resolved, usable later to reply to or edit the message |
| `POST /email` | **$0.002** | the SMTP acceptance receipt — raw `250 …` response, reply code, Message-ID, host — plus accepted/rejected recipients and the envelope as sent |
| `GET /health` | free | Liveness, active data source, configured rails |
| `GET /.well-known/x402` | free | Machine-readable discovery manifest |

Every paid route returns the purchased artifact **in the 200 body**. Nothing is deferred to a webhook or a later fetch.

Full reference: [docs/api.md](docs/api.md) · [openapi.json](openapi.json) · [skill.md](skill.md)

## How x402 works

```
  agent                            x402-notify                    facilitator
    │  GET /telegram          │                                │
    ├──────────────────────────────▶│                                │
    │  402 + accepts[base, solana]  │                                │
    ◀──────────────────────────────┤                                │
    │  sign USDC authorization      │                                │
    │  retry + X-PAYMENT            │                                │
    ├──────────────────────────────▶│  verify + settle               │
    │                               ├───────────────────────────────▶│
    │  200 + artifact               │                                │
    │  + X-PAYMENT-RESPONSE         │  ◀── tx hash / signature ──────┤
    ◀──────────────────────────────┤                                │
```

**Pay in USDC on Base or Solana — your client picks the rail.** The 402 challenge always lists both:

| Rail | Network | Asset | payTo |
|---|---|---|---|
| EVM | `base-sepolia` (`base` via `NETWORK=base`) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` | USDC (SPL) | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

The Solana rail's `extra.feePayer` is a public facilitator sponsor account that pays the SOL network fee, so a buyer needs only USDC — no SOL for gas. Wallets that sign serialized transactions (Phantom, most agent SDKs) can use the built-in helpers at `POST /api/x402-checkout?action=prepare|encode`.

## Real backend / API keys

The two channels are configured independently, so you can enable either or both.

| Env var | Unlocks |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Real Telegram delivery. Free from [@BotFather](https://t.me/botfather) — send it `/newbot`. |
| `TELEGRAM_BASE_URL` | Point at a self-hosted Bot API server — rarely needed. |
| `SMTP_HOST` | Real email relay. Works with any SMTP server. |
| `SMTP_PORT` | Default `587` (STARTTLS). `465` switches to implicit TLS automatically. |
| `SMTP_USER` / `SMTP_PASS` | Credentials. Omit both for an unauthenticated relay. |
| `SMTP_FROM` | Default From address. Falls back to `SMTP_USER`. |
| `SMTP_SECURE` | Force implicit TLS on or off, overriding the port heuristic. |

**Without them, everything still works — and tells you so.** An unconfigured channel validates the request exactly as a live send would (address syntax, length limits, required fields), then returns `"delivered": false` with a `dryRunReason`. The receipt has the same shape as a live one, so you can build and test the whole flow, then flip a single env var to make it real. There is no mode in which this service claims a delivery it did not make.

To find a Telegram `chatId`: message your bot, then `GET https://api.telegram.org/bot<TOKEN>/getUpdates` and read `result[].message.chat.id`. For a channel, use `@channelusername` and make the bot an admin.

## Human checkout

For a browser-facing checkout, drop in [`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal) — it reads the 402 challenge and drives the whole connect → sign → settle flow for **both** rails (Phantom on Solana, any injected wallet on EVM), with SIWX re-entry so a returning buyer skips the wallet prompt, and client-side spending caps that stop an agent or a mis-click from over-spending. Reference it from npm or the CDN; it is a separate proprietary package and is never vendored here.

## For AI agents

- **[`skill.md`](skill.md)** — the agent-facing contract: every endpoint, its price, its response schema, and how to pay. Point your agent at this file.
- **`GET /.well-known/x402`** — machine-readable discovery ([manifest](public/.well-known/x402)). Lists both rails per resource.
- **[`examples/mcp-tool.md`](examples/mcp-tool.md)** — expose this service as an MCP tool for Claude in about 30 lines.
- **[`examples/agent-client.ts`](examples/agent-client.ts)** — a complete paid call with `x402-fetch`, printing the artifact and the decoded settlement receipt.
- **Discovery/listing** — indexable by [x402scan.com](https://x402scan.com), the [x402 Bazaar](https://x402.org), and [agentic.market](https://agentic.market). Deploy, then submit your public base URL; all three read `/.well-known/x402`.

## Docs

<https://nirholas.github.io/x402-notify/> — [tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [for agents](docs/agents.md)

## Support

nichxbt@gmail.com

## License

Apache-2.0 — see [LICENSE](LICENSE).

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nirholas/x402-notify&type=Date)](https://www.star-history.com/#nirholas/x402-notify&Date)
