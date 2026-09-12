# How an agent reaches this server

Four clients, four incompatible config shapes. Measured against their documentation 2026-09-12 —
this is the reason the evidence carries four snippets and not one.

The endpoint is `https://mcp.caplane.xyz/mcp`. No key, no account: authorization is optional in the
specification and a public read-only registry declines it deliberately, so no client will ever be
sent a `401` and none will start an OAuth flow.

## Claude Code — requires `type`

```bash
claude mcp add --transport http caplane https://mcp.caplane.xyz/mcp
```

or in `.mcp.json`:

```json
{ "mcpServers": { "caplane": { "type": "http", "url": "https://mcp.caplane.xyz/mcp" } } }
```

## Cursor — forbids `type`

```json
{ "mcpServers": { "caplane": { "url": "https://mcp.caplane.xyz/mcp" } } }
```

## VS Code — `servers`, not `mcpServers`

```json
{ "servers": { "caplane": { "type": "http", "url": "https://mcp.caplane.xyz/mcp" } } }
```

## Claude Desktop — no config file for this

Added through the application's connector interface, not by editing JSON. And the connection is
made **from the provider's cloud, not from the laptop**, so the server has to be reachable from
outside — which a competitor's server on a loopback port is not.

## The inspector

```bash
npx @modelcontextprotocol/inspector
```

It is a browser application served from a loopback port, so it sends a loopback `Origin`. Allowing
those is not a relaxation: refusing them made the official conformance suite's own DNS-rebinding
scenario fail, with `Expected HTTP 2xx for valid localhost Host/Origin headers, got 403`. A foreign
origin is still refused, and a request with no `Origin` — the normal case, because an MCP client is
not a browser — is allowed. See `01-conformance.txt`.
