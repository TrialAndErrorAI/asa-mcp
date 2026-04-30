# Changelog

## 0.1.0 — 2026-04-30

First public npm release as `@trialanderror-ai/asa-mcp`.

- **Code Mode architecture**: 11 Apple Search Ads endpoints exposed through 2 tools (`search`, `execute`) plus `test_connection` health check.
- **Hand-built OpenAPI spec**: Apple does NOT publish an OpenAPI spec for Apple Search Ads (they do for App Store Connect — 923 endpoints). This package ships a hand-built spec for the 11 endpoints across 5 resources (Campaign, AdGroup, Keyword, NegativeKeyword, Report) most commonly needed for ASA campaign management.
- **Apple gotchas baked into spec descriptions**: `POST /targetingkeywords` silently ignores `bidAmount` on create (always follow with bulk PUT); `PUT /targetingkeywords/{id}` does not exist (404) — use bulk endpoint even for single updates; negative keywords max 5 per request; Max_Conv campaigns have no keyword-level data (use `/reports/campaigns` instead).
- **JWT auth**: ES256 P8 key signing for Apple Search Ads Campaign Management API.
- **Sandboxed execution**: `vm` runs LLM-written JS in an isolated context with the ASA API client + spec injected.
- Inspired by [Cloudflare's Code Mode pattern](https://blog.cloudflare.com/code-mode/) and the sister package [`@trialanderror-ai/appstore-connect-mcp`](https://www.npmjs.com/package/@trialanderror-ai/appstore-connect-mcp).

Internal version 0.0.1 (2026-04-24, never npm-published) preceded this release.
