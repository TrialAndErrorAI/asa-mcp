/**
 * Apple Search Ads OAuth2 client-credentials auth manager.
 *
 * Flow (Apr 2026):
 *   1. Sign JWT with ES256 private key (p8) — this is the "client_secret"
 *   2. POST to https://appleid.apple.com/auth/oauth2/token with grant_type=client_credentials
 *   3. Receive access_token valid ~1 hour. Cache until expiry.
 *
 * Distinct from ASC's per-request JWT: ASA uses OAuth2 tokens that we cache.
 */

import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import axios from 'axios';

export interface ASAAuthConfig {
  clientId: string;      // SEARCHADS.xxxx — also used as `sub` + `iss`
  teamId: string;        // Same as clientId in our case
  keyId: string;         // p8 key id (fa7a2862-...)
  p8Path: string;        // Path to Apple Search Ads private key .p8 file
}

export class ASAAuthManager {
  private config: ASAAuthConfig;
  private privateKey: string;
  private cachedToken: string | null = null;
  private tokenExpiryMs: number = 0;

  constructor(config: ASAAuthConfig) {
    this.config = config;
    this.privateKey = readFileSync(config.p8Path, 'utf-8');
  }

  /**
   * Generate the client_secret JWT (180-day expiry).
   * This is NOT the access token — it's what we exchange FOR the access token.
   */
  private generateClientSecret(): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iss: this.config.teamId,
        iat: now,
        exp: now + 86400 * 180,
        aud: 'https://appleid.apple.com',
        sub: this.config.clientId,
      },
      this.privateKey,
      {
        algorithm: 'ES256',
        keyid: this.config.keyId,
      }
    );
  }

  /**
   * Get a valid access token, refreshing if expired.
   * Tokens live ~1 hour; we refresh 60s early.
   */
  async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiryMs) {
      return this.cachedToken;
    }

    const clientSecret = this.generateClientSecret();

    const response = await axios.post(
      'https://appleid.apple.com/auth/oauth2/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: clientSecret,
        scope: 'searchadsorg',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    this.cachedToken = response.data.access_token;
    this.tokenExpiryMs = Date.now() + ((response.data.expires_in || 3600) - 60) * 1000;
    return this.cachedToken!;
  }
}
