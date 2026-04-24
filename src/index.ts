#!/usr/bin/env node
/**
 * asa-mcp — Apple Search Ads MCP server entry point.
 */

import dotenv from 'dotenv';
import { ASAMCPServer } from './server/mcp-server.js';

console.log = () => {};
console.error = (...args: unknown[]) => { process.stderr.write(args.map(String).join(' ') + '\n'); };
console.warn = () => {};
console.info = () => {};
console.debug = () => {};

dotenv.config();

async function main() {
  const clientId = process.env.ASA_CLIENT_ID;
  const teamId = process.env.ASA_TEAM_ID || clientId;
  const keyId = process.env.ASA_KEY_ID;
  const p8Path = process.env.ASA_P8_PATH;
  const orgId = process.env.ASA_ORG_ID;
  const nonUsOrgId = process.env.ASA_NON_US_ORG_ID;

  if (!clientId || !keyId || !p8Path || !orgId) {
    process.stderr.write('Missing required env vars: ASA_CLIENT_ID, ASA_KEY_ID, ASA_P8_PATH, ASA_ORG_ID\n');
    process.exit(1);
  }

  try {
    const server = new ASAMCPServer({
      auth: { clientId, teamId: teamId!, keyId, p8Path },
      client: { defaultOrgId: orgId, nonUsOrgId },
    });
    await server.start();
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
  } catch (err) {
    process.stderr.write(`Failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  process.stderr.write(`Uncaught: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
