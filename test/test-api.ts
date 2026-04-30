/**
 * End-to-end smoke test: spec loader + sandbox executor + real API call.
 * Mirrors what the MCP will do on tool invocation.
 */

import dotenv from 'dotenv';
import { loadSpec } from '../src/spec/loader.js';
import { executeInSandbox } from '../src/executor/sandbox.js';
import { ASAAuthManager } from '../src/auth/asa-auth.js';
import { ASAClient } from '../src/api/client.js';

dotenv.config();

async function main() {
  const { ASA_CLIENT_ID, ASA_TEAM_ID, ASA_KEY_ID, ASA_P8_PATH, ASA_ORG_ID } = process.env;
  if (!ASA_CLIENT_ID || !ASA_KEY_ID || !ASA_P8_PATH || !ASA_ORG_ID) {
    throw new Error('Missing env');
  }

  const auth = new ASAAuthManager({ clientId: ASA_CLIENT_ID, teamId: ASA_TEAM_ID || ASA_CLIENT_ID, keyId: ASA_KEY_ID, p8Path: ASA_P8_PATH });
  const client = new ASAClient(auth, { defaultOrgId: ASA_ORG_ID });
  const spec = loadSpec();

  console.log(`=== Loaded spec ===`);
  console.log(`Paths: ${spec.pathCount} | Schemas: ${spec.schemaCount}`);
  console.log(`Title: ${spec.info.title} ${spec.info.version}`);
  console.log();

  // TEST 1: search tool — ask sandbox to find all keyword endpoints
  console.log(`=== TEST 1: search tool (sandbox) ===`);
  const searchCode = `
    const kw = Object.entries(spec.paths)
      .filter(([p]) => p.includes('keyword'))
      .map(([p, methods]) => ({ path: p, methods: Object.keys(methods) }));
    return kw;
  `;
  const searchResult = await executeInSandbox(searchCode, { spec });
  console.log(JSON.stringify(searchResult.result, null, 2));
  if (searchResult.error) throw new Error(`Sandbox error: ${searchResult.error}`);

  // TEST 2: execute tool — real API call (list campaigns)
  console.log(`\n=== TEST 2: execute tool (real API call — list campaigns) ===`);
  const execCode = `
    const r = await api.request({ method: 'GET', path: '/campaigns', params: { limit: 100 } });
    return r.data.filter(c => c.status === 'ENABLED').map(c => ({ id: c.id, name: c.name, budget: c.dailyBudgetAmount?.amount }));
  `;
  const execResult = await executeInSandbox(execCode, { api: client });
  if (execResult.error) throw new Error(`Exec error: ${execResult.error}`);
  console.log(JSON.stringify(execResult.result, null, 2));

  // TEST 3: execute tool — fetch keyword report via report endpoint
  console.log(`\n=== TEST 3: execute tool — keyword report for RAI_US_Brand ===`);
  const reportCode = `
    const rep = await api.request({
      method: 'POST',
      path: '/reports/campaigns/YOUR_CAMPAIGN_ID/keywords',
      body: {
        startTime: '2026-04-17', endTime: '2026-04-23',
        granularity: 'DAILY',
        selector: { orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }], pagination: { offset: 0, limit: 100 } },
        returnRowTotals: true, returnGrandTotals: true
      }
    });
    const rows = rep.data.reportingDataResponse.row;
    return {
      rowCount: rows.length,
      keywords: rows.map(r => {
        let spend = 0, installs = 0;
        for (const d of (r.granularity || [])) {
          spend += parseFloat(d.localSpend?.amount || '0');
          installs += (d.tapInstalls || 0);
        }
        return { kw: r.metadata.keyword, match: r.metadata.matchType, spend: spend.toFixed(2), installs };
      })
    };
  `;
  const reportResult = await executeInSandbox(reportCode, { api: client });
  if (reportResult.error) throw new Error(`Report error: ${reportResult.error}`);
  console.log(JSON.stringify(reportResult.result, null, 2));

  console.log('\n✅ All 3 tests passed — asa-mcp v0.1.0 is functional.');
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
