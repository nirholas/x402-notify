/**
 * Per-route x402 schemas — GENERATED FROM `openapi.json`, do not edit by hand.
 *
 * The x402 challenge a paid route answers with has to tell an agent two things
 * it cannot guess: how to call the route, and what it gets back for its money.
 * Both live under `accepts[].outputSchema` in the x402 Bazaar shape:
 *
 *     outputSchema.input   how to invoke  (method + path/query params or JSON body fields)
 *     outputSchema.output  the JSON Schema of the 200/201 body
 *
 * Keys match the paywall route map in `server.ts` exactly, so a route is
 * declared once and its schema is spread in:
 *
 *     "POST /thing": { price: "$0.01", description: "…", ...ROUTE_SCHEMAS["POST /thing"] }
 *
 * Everything here is copied verbatim from this service's OpenAPI document, so
 * the runtime 402 and the published spec can never drift apart.
 */

/** How an agent invokes a paid route. */
export type X402Input = {
  type: "http";
  method: string;
  /** Path segments, e.g. `:id` in `/cases/:id`. */
  pathParams?: Record<string, unknown>;
  queryParams?: Record<string, unknown>;
  queryRequired?: string[];
  bodyType?: "json";
  /** JSON Schema properties of the request body. */
  bodyFields?: Record<string, unknown>;
  bodyRequired?: string[];
};

/** The `outputSchema` object published in every `accepts[]` entry. */
export type X402RouteSchema = {
  input: X402Input;
  /** JSON Schema of the success response body. */
  output: Record<string, unknown>;
};

export type RouteSchemaEntry = { outputSchema: X402RouteSchema };

export const ROUTE_SCHEMAS: Record<string, RouteSchemaEntry> = {
  "POST /telegram": {
    "outputSchema": {
      "input": {
        "type": "http",
        "method": "POST",
        "bodyType": "json",
        "bodyFields": {
          "chatId": {
            "type": "string"
          },
          "text": {
            "type": "string"
          },
          "parseMode": {
            "type": "string"
          },
          "silent": {
            "type": "boolean"
          }
        }
      },
      "output": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string"
          },
          "channel": {
            "type": "string"
          },
          "delivered": {
            "type": "boolean"
          },
          "messageId": {
            "type": "integer"
          },
          "chat": {
            "type": "object",
            "properties": {
              "id": {
                "type": "integer"
              },
              "type": {
                "type": "string"
              },
              "title": {
                "type": [
                  "null",
                  "string"
                ]
              },
              "username": {
                "type": [
                  "null",
                  "string"
                ]
              }
            }
          },
          "deliveredAt": {
            "type": "string"
          },
          "textLength": {
            "type": "integer"
          },
          "parseMode": {
            "type": "string"
          },
          "silent": {
            "type": "boolean"
          },
          "dryRunReason": {
            "type": "string"
          },
          "payment": {
            "type": "object",
            "properties": {
              "success": {
                "type": "boolean"
              },
              "rail": {
                "type": "string"
              },
              "network": {
                "type": "string"
              },
              "transaction": {
                "type": "string"
              },
              "payer": {
                "type": "string"
              },
              "amount": {
                "type": "string"
              },
              "asset": {
                "type": "string"
              },
              "resource": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  },
  "POST /email": {
    "outputSchema": {
      "input": {
        "type": "http",
        "method": "POST",
        "bodyType": "json",
        "bodyFields": {
          "to": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "subject": {
            "type": "string"
          },
          "text": {
            "type": "string"
          },
          "from": {
            "type": "string"
          }
        }
      },
      "output": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string"
          },
          "channel": {
            "type": "string"
          },
          "delivered": {
            "type": "boolean"
          },
          "receipt": {
            "type": "object",
            "properties": {
              "messageId": {
                "type": "string"
              },
              "smtpResponse": {
                "type": "string"
              },
              "smtpCode": {
                "type": "integer"
              },
              "host": {
                "type": "string"
              },
              "acceptedAt": {
                "type": "string"
              }
            }
          },
          "accepted": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "rejected": {
            "type": "array",
            "items": {}
          },
          "envelope": {
            "type": "object",
            "properties": {
              "from": {
                "type": "string"
              },
              "to": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          },
          "subject": {
            "type": "string"
          },
          "bodyBytes": {
            "type": "integer"
          },
          "dryRunReason": {
            "type": "string"
          },
          "payment": {
            "type": "object",
            "properties": {
              "success": {
                "type": "boolean"
              },
              "rail": {
                "type": "string"
              },
              "network": {
                "type": "string"
              },
              "transaction": {
                "type": "string"
              },
              "payer": {
                "type": "string"
              },
              "amount": {
                "type": "string"
              },
              "asset": {
                "type": "string"
              },
              "resource": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  }
};
