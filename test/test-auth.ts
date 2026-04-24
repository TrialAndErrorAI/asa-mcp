/**
 * Smoke test: ASA OAuth2 token exchange works.
 * Run: ASA_* env vars set → `npm run test:auth`
 */

import dotenv from 'dotenv';
import { ASAAuthManager } from '../src/auth/asa-auth.js';

dotenv.config();

async function main() {
  const { ASA_CLIENT_ID, ASA_TEAM_ID, ASA_KEY_ID, ASA_P8_PATH } = process.env;
  if (!ASA_CLIENT_ID || !ASA_KEY_ID || !ASA_P8_PATH) {
    console.error('Missing env vars: ASA_CLIENT_ID, ASA_KEY_ID, ASA_P8_PATH');
    process.exit(1);
  }

  const auth = new ASAAuthManager({
    clientId: ASA_CLIENT_ID,
    teamId: ASA_TEAM_ID || ASA_CLIENT_ID,
    keyId: ASA_KEY_ID,
    p8Path: ASA_P8_PATH,
  });

  console.log('Fetching access token...');
  const token = await auth.getAccessToken();
  console.log(`Token (first 32 chars): ${token.substring(0, 32)}...`);
  console.log(`Token length: ${token.length}`);
  console.log('✅ Auth works');
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
