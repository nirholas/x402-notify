# Expose x402-notify as an MCP tool

[MCP](https://modelcontextprotocol.io) lets Claude (and other MCP clients) call this service directly. The payment is invisible to the model: the wrapper handles the 402 and returns only the artifact.

## Install

```bash
npm install @modelcontextprotocol/sdk x402-fetch viem
```

## `mcp-server.ts`

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE_URL = process.env.NOTIFY_URL ?? "http://localhost:4025";

// One wallet, reused for every tool call. On base-sepolia this is testnet USDC.
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const payFetch = wrapFetchWithPayment(fetch, account);

const TOOLS = [
  {
    name: "notify_send_telegram",
    description: "Deliver one Telegram message to a chat, group or channel. Costs $0.002 in USDC (paid automatically via x402).",
    inputSchema: {
          "type": "object",
          "properties": {
                "chatId": {
                      "type": "string",
                      "description": "See skill.md for the full shape of `chatId`."
                },
                "text": {
                      "type": "string",
                      "description": "See skill.md for the full shape of `text`."
                },
                "parseMode": {
                      "type": "string",
                      "description": "See skill.md for the full shape of `parseMode`."
                },
                "silent": {
                      "type": "boolean",
                      "description": "See skill.md for the full shape of `silent`."
                }
          },
          "required": [
                "chatId",
                "text",
                "parseMode",
                "silent"
          ]
    },
  },
  {
    name: "notify_send_email",
    description: "Relay one email over SMTP and return the server's acceptance receipt. Costs $0.002 in USDC (paid automatically via x402).",
    inputSchema: {
          "type": "object",
          "properties": {
                "to": {
                      "type": "array",
                      "items": {
                            "type": "string"
                      },
                      "description": "See skill.md for the full shape of `to`."
                },
                "subject": {
                      "type": "string",
                      "description": "See skill.md for the full shape of `subject`."
                },
                "text": {
                      "type": "string",
                      "description": "See skill.md for the full shape of `text`."
                },
                "from": {
                      "type": "string",
                      "description": "See skill.md for the full shape of `from`."
                }
          },
          "required": [
                "to",
                "subject",
                "text",
                "from"
          ]
    },
  },
];

const server = new Server({ name: "x402-notify", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  let res: Response;

  switch (req.params.name) {
    case "notify_send_telegram": {
      res = await payFetch(new URL("/telegram", BASE_URL).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      break;
    }
    case "notify_send_email": {
      res = await payFetch(new URL("/email", BASE_URL).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      break;
    }
    default:
      throw new Error(`unknown tool: ${req.params.name}`);
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`x402-notify ${res.status}: ${detail}`);
  }

  // The artifact is the 200 body — hand it straight to the model.
  return { content: [{ type: "text", text: await res.text() }] };
});

await server.connect(new StdioServerTransport());
```

## Register it with Claude Desktop

```json
{
  "mcpServers": {
    "x402-notify": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-server.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedKey",
        "NOTIFY_URL": "http://localhost:4025"
      }
    }
  }
}
```

## Notes

- **Budget the wallet.** Every tool call spends real USDC (POST /telegram = $0.002, POST /email = $0.002). Fund the key with only what a session should be allowed to spend — that cap is your real spending limit.
- **Both rails work.** The example uses the EVM rail because `x402-fetch` handles it in one wrapper. For a Solana-funded agent, use the `/api/x402-checkout` helpers described in [`curl.md`](curl.md) and set the `X-PAYMENT` header yourself.
- **Receipts.** `res.headers.get("X-PAYMENT-RESPONSE")` (base64 JSON) is the settlement proof; the body's `payment` field carries the same thing if you'd rather log the parsed artifact.
- **Point the model at [`skill.md`](../skill.md)** as a resource so it knows the response schemas without a trial call.
