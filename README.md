# asa-mcp

Code Mode MCP server for **Apple Search Ads Campaign Management API**. Two tools (`search` + `execute`), hand-built OpenAPI spec.

## Why this exists

Apple publishes an official OpenAPI for **App Store Connect** (923 endpoints) but NOT for **Apple Search Ads**. This MCP hand-builds the spec from the endpoints Trial and Error Inc. actually uses. Ship minimal, expand on demand.

**Tool count discipline:** 2 tools (`search`, `execute`) — fixed token cost regardless of endpoint count. Adding an endpoint = updating `src/spec/openapi.json`, zero tool changes.

## What it covers (v0.0.1)

11 endpoints across 5 resources:
- **Campaign**: list, get, update (status, budget, name)
- **AdGroup**: list, create
- **Keyword**: list, add (POST), bulk update (PUT)
- **NegativeKeyword**: list, add
- **Report**: campaigns, adgroups, keywords, searchterms
- **Auth**: `/acls` (health check)

Critical Apple gotchas baked into spec descriptions:
- `POST /targetingkeywords` silently ignores `bidAmount` on create — always follow with bulk PUT
- `PUT /targetingkeywords/{id}` does NOT exist (404) — use bulk endpoint even for single updates
- Negative keywords: max 5 at a time (Feb 13 2026 incident)
- Max_Conv campaigns have no keyword-level data — use `/reports/campaigns` instead

## Setup

```bash
npm install
npm run build
```

Create `.env`:
```
ASA_CLIENT_ID=SEARCHADS.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ASA_TEAM_ID=SEARCHADS.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ASA_KEY_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ASA_P8_PATH=/absolute/path/to/apple_search_ads_private_key.p8
ASA_ORG_ID=6290230
ASA_NON_US_ORG_ID=8569880
```

Smoke-test auth + a real API call:
```bash
npm run test:auth
npm run test:api
```

## Claude Code config

Add to `~/.claude/config.json` or project `.claude/config.json`:

```json
{
  "mcpServers": {
    "asa": {
      "command": "node",
      "args": ["/Users/sid/Code/te/asa-mcp/dist/index.js"],
      "env": {
        "ASA_CLIENT_ID": "SEARCHADS.xxxx",
        "ASA_TEAM_ID": "SEARCHADS.xxxx",
        "ASA_KEY_ID": "xxxx",
        "ASA_P8_PATH": "/path/to/key.p8",
        "ASA_ORG_ID": "6290230",
        "ASA_NON_US_ORG_ID": "8569880"
      }
    }
  }
}
```

## Usage pattern (in Claude Code)

```
Agent: mcp__asa__search({ code: `
  return Object.keys(spec.paths).filter(p => p.includes('report'));
` })

Agent: mcp__asa__execute({ code: `
  const rep = await api.request({
    method: 'POST',
    path: '/reports/campaigns/2143274136/keywords',
    body: {
      startTime: '2026-04-10', endTime: '2026-04-23',
      granularity: 'DAILY',
      selector: { pagination: { offset: 0, limit: 1000 } },
      returnRowTotals: true, returnGrandTotals: true
    }
  });
  return rep.data.reportingDataResponse.row.map(r => ({
    kw: r.metadata.keyword,
    spend: r.total.localSpend.amount,
    installs: r.total.tapInstalls
  }));
` })
```

## Architecture

```
src/
  index.ts                 — entry (stdio MCP transport)
  server/mcp-server.ts     — 2 tool definitions (search, execute)
  auth/asa-auth.ts         — OAuth2 client-credentials, ES256 JWT client_secret, token cache
  api/client.ts            — axios client, auto-inject Bearer + X-AP-Context
  spec/
    openapi.json           — hand-built spec (11 endpoints, 9 schemas) — expand here
    loader.ts              — $ref resolver for sandbox traversal
  executor/sandbox.ts      — vm isolate for agent-generated JS
```

## Expanding the spec

To add a new endpoint:
1. Add to `src/spec/openapi.json` → `paths` with method, parameters, requestBody, responses
2. Include critical gotchas in the `description` field (Apple quirks, batch limits, etc.)
3. Run `npm run build`
4. Agent can now discover + call it via `search` → `execute`

## Ownership

Private repo. Trial and Error Inc. ASO competitive tooling. Not public (per Sid's policy — `asoworld-mcp` private, `appstore-connect-mcp` public, `asa-mcp` private).

## Version history

- **0.0.1** (2026-04-24): Initial scaffold. 11 endpoints. Discovered Apple's missing-PUT-endpoint bug + bid-override-on-create during session that birthed this MCP.
