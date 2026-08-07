# For AI agents — x402-notify

How an autonomous agent finds this service, pays for a call, and uses what comes back.

## 1. Discovery

Two machine-readable entry points, both free:

```bash
curl -s {BASE_URL}/.well-known/x402      # the manifest below
```

```jsonc
{
  "x402Version": 1,
  "name": "x402-notify",
  "description": "Real message delivery per-message: Telegram bot messages and SMTP email with delivery receipts in-response",
  "resources": [
    {
      "resource": "POST /telegram",
      "description": "Deliver one Telegram message to a chat, group or channel.",
      "price": "$0.002",
      "accepts": [
        { "scheme": "exact", "network": "base-sepolia", "asset": "USDC", "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "2000" },
        { "scheme": "exact", "network": "solana",       "asset": "USDC", "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "2000" }
      ],
      "outputSchema": { /* … */ }
    }
    // …
  ]
}
```

And [`skill.md`](https://github.com/nirholas/x402-notify/blob/main/skill.md) at the repo root — the prose contract written for a model to read directly: what each endpoint does, its price, its exact response shape, and the error codes. Drop it into your agent's context and it can call this service without any other documentation.

## 2. Paying

**Pay in USDC on Base or Solana — your client picks the rail.** Every 402 lists both:

| Rail | Network | Asset | payTo | Facilitator |
|---|---|---|---|---|
| EVM | `base-sepolia` / `base` | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `https://x402.org/facilitator` |
| Solana | `solana` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `https://facilitator.payai.network` |

### EVM

The wallet signs an EIP-3009 transfer authorization entirely locally — no round-trip, no gas from the agent. With [`x402-fetch`](https://www.npmjs.com/package/x402-fetch) it's two lines:

```ts
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const payFetch = wrapFetchWithPayment(fetch, privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`));
const res = await payFetch("{BASE_URL}/telegram");   // 402 → pay → 200, transparently
```

### Solana

Solana wallets sign serialized transactions, so the server builds one for you:

```
POST {BASE_URL}/api/x402-checkout?action=prepare
  { "accept": <solana entry from the 402>, "buyer": "<base58 pubkey>" }
  → { "tx_base64", "recent_blockhash" }

POST {BASE_URL}/api/x402-checkout?action=encode
  { "accept": <same>, "signed_tx_base64": "<signed>", "resource_url": "<resource>" }
  → { "x_payment" }
```

Retry the original request with `X-PAYMENT: <x_payment>`. The `extra.feePayer` sponsor covers the SOL network fee, so the agent's wallet needs only USDC.

## 3. What you get back

A `200` whose body **is** the artifact — every paid route in this service returns what you bought inline. No job ids, no polling, no webhooks. Alongside it:

- `X-PAYMENT-RESPONSE` header — base64 JSON settlement receipt
- `payment` field in the body — the same receipt, for agents that only parse JSON

```json
{ "success": true, "rail": "solana", "network": "solana", "transaction": "5xk…", "payer": "9wF…", "amount": "2000" }
```

Persist it — it's the audit trail linking a spend to the data it bought.

## 4. Budgeting

- `POST /telegram` → **$0.002**
- `POST /email` → **$0.002**

Both channels are `$0.002` per message. An email to 50 recipients is one call and one payment, not fifty. 1,000 notifications cost $2.

## 5. MCP integration

[`examples/mcp-tool.md`](https://github.com/nirholas/x402-notify/blob/main/examples/mcp-tool.md) has a complete MCP server exposing these 2 endpoints as tools for Claude, with the payment wrapper already wired in.

## 6. Listing this service

Once deployed at a public origin (set `PUBLIC_BASE_URL` so the 402 `resource` is correct):

- **[x402scan.com](https://x402scan.com)** — crawls `/.well-known/x402`; submit your base URL.
- **x402 Bazaar** — the protocol's own directory, reachable through the facilitator's `list` API; see <https://x402.org>.
- **[agentic.market](https://agentic.market)** — agent-facing marketplace; the manifest plus `skill.md` is all it needs.

All three read the same manifest this repo already serves, so listing is a URL submission, not an integration.

## 7. Data honesty

Telegram delivers for real when `TELEGRAM_BOT_TOKEN` is set (a free token from @BotFather). Email relays for real when `SMTP_HOST` is set (any server: Gmail app password, Postmark, SES, Mailtrap, a local relay). Each channel is independent — you can run one live and one dry. Unconfigured channels return `"source": "fixture"`, `"delivered": false` and a `dryRunReason` explaining exactly what was skipped. **Nothing ever reports a delivery that didn't happen.**

An agent should branch on the `source` field rather than assume live data.
