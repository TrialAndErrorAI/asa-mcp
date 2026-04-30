/**
 * Apple Search Ads MCP Server — Code Mode
 *
 * Two tools. ~12 endpoints (growing). Fixed token cost per conversation.
 *
 *   search(code)  — agent writes JS to query the OpenAPI spec
 *   execute(code) — agent writes JS to call the authenticated ASA API
 *
 * Apple does NOT publish OpenAPI for ASA — `src/spec/openapi.json` is hand-built
 * from the endpoints we actually use. Expand it, not the tool surface.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ASAAuthManager, ASAAuthConfig } from '../auth/asa-auth.js';
import { ASAClient, ASAClientConfig } from '../api/client.js';
import { loadSpec, ResolvedSpec } from '../spec/loader.js';
import { executeInSandbox } from '../executor/sandbox.js';

export interface ASAServerConfig {
  auth: ASAAuthConfig;
  client: ASAClientConfig;
}

export class ASAMCPServer {
  private server: Server;
  private auth: ASAAuthManager;
  private client: ASAClient;
  private spec: ResolvedSpec;

  constructor(config: ASAServerConfig) {
    this.server = new Server(
      { name: 'asa-mcp', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    this.auth = new ASAAuthManager(config.auth);
    this.client = new ASAClient(this.auth, config.client);
    this.spec = loadSpec();

    this.registerHandlers();
  }

  private registerHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getToolDefinitions(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await this.executeTool(name, (args || {}) as any);
        return {
          content: [{
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    });
  }

  private getToolDefinitions(): any[] {
    return [
      {
        name: 'search',
        description: `Write JavaScript to explore the Apple Search Ads API specification (${this.spec.pathCount} endpoints, ${this.spec.schemaCount} schemas, hand-built from ${this.spec.info.version}).

Available globals:
- \`spec\` — Object with API endpoints. Structure: spec.paths['/campaigns'].get

⚠️ NOT a complete Apple ASA API spec. Covers the endpoints Trial and Error Inc. actively uses. Expand src/spec/openapi.json if you need more. Apple does not publish an official OpenAPI for ASA.

How to use:
- List endpoints: Object.keys(spec.paths)
- Filter by keyword: Object.entries(spec.paths).filter(([p]) => p.includes('keyword'))
- Get details: spec.paths['/campaigns/{campaignId}/adgroups/{adGroupId}/targetingkeywords/bulk'].put
- Check parameters: ... .parameters
- Check request body: ... .requestBody.schema
- Check response: ... .responses['200'].schema

Return findings as a value or use console.log().

Critical gotchas already documented in spec descriptions:
- POST /targetingkeywords silently overrides bidAmount to $1 on create — always follow with bulk PUT
- PUT /targetingkeywords/{id} does NOT exist (404) — use bulk endpoint even for single updates
- Negative keyword batch limit: 5 at a time (Feb 13 2026 incident protocol)`,
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'JavaScript code to execute. Has access to `spec` object.',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'execute',
        description: `Write JavaScript to call the Apple Search Ads API. Auth + org context auto-injected.

Available globals:
- \`api\` — authenticated client for ASA.

Usage:
  const r = await api.request({
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: '/campaigns',                    // from search results
    params: { limit: 1000 },              // query string (optional)
    body: { ... },                         // POST/PUT body (optional)
    orgId: 'YOUR_NON_US_ORG_ID',                      // override org for Non-US (optional, default is main US org)
  });

Reports endpoints return:
  r.data.reportingDataResponse.row[]
  Each row: { metadata: {...}, total: {...}, granularity: [{date, localSpend, tapInstalls, ...}] }

Errors: Apple returns { data: null, error: { errors: [{ messageCode, message, field }] } }
  The client throws them as "ASA API 404: RESOURCE_NOT_FOUND: ..." strings.

Example — pull Brand campaign 14d keyword report:
  const rep = await api.request({
    method: 'POST',
    path: '/reports/campaigns/YOUR_CAMPAIGN_ID/keywords',
    body: {
      startTime: '2026-04-10', endTime: '2026-04-23',
      granularity: 'DAILY',
      selector: { orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }], pagination: { offset: 0, limit: 1000 } },
      returnRowTotals: true, returnGrandTotals: true
    }
  });
  return rep.data.reportingDataResponse.row.map(r => ({
    kw: r.metadata.keyword,
    spend: r.total.localSpend.amount,
    installs: r.total.tapInstalls
  }));`,
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'JavaScript code to execute. Has access to the authenticated `api` client.',
            },
          },
          required: ['code'],
        },
      },
    ];
  }

  private async executeTool(name: string, args: { code: string }): Promise<any> {
    if (!args.code || typeof args.code !== 'string') {
      throw new Error(`Tool '${name}' requires a 'code' string argument`);
    }

    if (name === 'search') {
      const result = await executeInSandbox(args.code, { spec: this.spec });
      return this.formatResult(result);
    }
    if (name === 'execute') {
      const result = await executeInSandbox(args.code, { api: this.client });
      return this.formatResult(result);
    }
    throw new Error(`Unknown tool: ${name}`);
  }

  private formatResult(r: { result: any; logs: string[]; error?: string }): any {
    if (r.error) return { error: r.error, logs: r.logs };
    if (r.logs.length) return { result: r.result, logs: r.logs };
    return r.result;
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    process.stderr.write('asa-mcp v0.1.0 started\n');
  }
}
