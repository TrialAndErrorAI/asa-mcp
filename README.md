# asa-mcp

Code Mode MCP server for **Apple Search Ads Campaign Management API**. Two tools (`search` + `execute`), hand-built OpenAPI spec.

## Why this exists

Apple publishes an official OpenAPI for **App Store Connect** (923 endpoints) but NOT for **Apple Search Ads**. This MCP hand-builds the spec from the endpoints Trial and Error Inc. actually uses. Ship minimal, expand on demand.

**Tool count discipline:** 2 tools (`search`, `execute`) — fixed token cost regardless of endpoint count. Adding an endpoint = updating `src/spec/openapi.json`, zero tool changes.

## What it covers

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

## Quick Start

### 1. Get Apple Search Ads API credentials

1. Go to https://app.searchads.apple.com → Settings → API → Add API Key
2. Download the `.p8` private key (only downloadable once!)
3. Note your Client ID, Key ID, and Org ID

### 2. Install via Claude Code

```bash
claude mcp add asa -s user \
  -e ASA_CLIENT_ID=SEARCHADS.xxxx \
  -e ASA_KEY_ID=xxxx \
  -e ASA_P8_PATH=/absolute/path/to/key.p8 \
  -e ASA_ORG_ID=YOUR_ASA_ORG_ID \
  -- npx -y @trialanderror-ai/asa-mcp
```

`-s user` makes the server available across all your projects.

### 3. Configure for Claude Code (manual `.mcp.json`)

```json
{
  "mcpServers": {
    "asa": {
      "command": "npx",
      "args": ["-y", "@trialanderror-ai/asa-mcp"],
      "env": {
        "ASA_CLIENT_ID": "SEARCHADS.xxxx",
        "ASA_KEY_ID": "xxxx",
        "ASA_P8_PATH": "/path/to/key.p8",
        "ASA_ORG_ID": "YOUR_ASA_ORG_ID"
      }
    }
  }
}
```

`ASA_TEAM_ID` is optional — defaults to `ASA_CLIENT_ID`. `ASA_NON_US_ORG_ID` is optional for multi-org accounts (passed inline via `execute` code, not auto-loaded).

### Configure for Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "asa": {
      "command": "npx",
      "args": ["-y", "@trialanderror-ai/asa-mcp"],
      "env": {
        "ASA_CLIENT_ID": "SEARCHADS.xxxx",
        "ASA_KEY_ID": "xxxx",
        "ASA_P8_PATH": "/path/to/key.p8",
        "ASA_ORG_ID": "YOUR_ASA_ORG_ID"
      }
    }
  }
}
```

### Build from source (alternative)

```bash
git clone https://github.com/TrialAndErrorAI/asa-mcp
cd asa-mcp
npm install
npm run build
```

Then point your MCP config at `node /path/to/asa-mcp/dist/index.js` instead of `npx`.

Smoke-test auth + a real API call:
```bash
npm run test:auth
npm run test:api
```

## Usage pattern (in Claude Code)

```
Agent: mcp__asa__search({ code: `
  return Object.keys(spec.paths).filter(p => p.includes('report'));
` })

Agent: mcp__asa__execute({ code: `
  const rep = await api.request({
    method: 'POST',
    path: '/reports/campaigns/YOUR_CAMPAIGN_ID/keywords',
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

## Credits

Built by [Trial and Error Inc](https://trialanderror.ai). Used in production by [RenovateAI](https://renovateai.app), an AI-powered home design app for iOS, Android, and web. Sister package: [`@trialanderror-ai/appstore-connect-mcp`](https://www.npmjs.com/package/@trialanderror-ai/appstore-connect-mcp) (App Store Connect, 923 endpoints). Code mode pattern from [Cloudflare](https://blog.cloudflare.com/code-mode/).
