/**
 * Apple Search Ads API client.
 *
 * All requests auto-inject:
 *   - Authorization: Bearer <access_token>
 *   - X-AP-Context: orgId=<ORG_ID>  (switchable per-call via options.orgId)
 *   - Content-Type: application/json
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { ASAAuthManager } from '../auth/asa-auth.js';

export interface ASAClientConfig {
  defaultOrgId: string;     // "6290230" for main Renovate org
  nonUsOrgId?: string;      // "8569880" for Non-US org — caller opts in via orgId
}

export class ASAClient {
  private baseURL = 'https://api.searchads.apple.com/api/v5';
  private auth: ASAAuthManager;
  private config: ASAClientConfig;
  private axiosInstance: AxiosInstance;

  constructor(auth: ASAAuthManager, config: ASAClientConfig) {
    this.auth = auth;
    this.config = config;
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
    });

    this.axiosInstance.interceptors.request.use(async (cfg) => {
      const token = await this.auth.getAccessToken();
      cfg.headers.Authorization = `Bearer ${token}`;
      // Caller may override org via options.headers
      if (!cfg.headers['X-AP-Context']) {
        cfg.headers['X-AP-Context'] = `orgId=${this.config.defaultOrgId}`;
      }
      if (!cfg.headers['Content-Type']) {
        cfg.headers['Content-Type'] = 'application/json';
      }
      return cfg;
    });

    this.axiosInstance.interceptors.response.use(
      (resp) => resp,
      (err) => this.handleError(err)
    );
  }

  /**
   * Generic request wrapper for the sandbox to call.
   *
   * @example
   *   api.request({ method: 'GET', path: '/campaigns', params: { limit: 1000 } })
   *   api.request({ method: 'PUT', path: '/campaigns/123/adgroups/456/targetingkeywords/bulk', body: [...] })
   *   api.request({ method: 'POST', path: '/reports/campaigns', body: {...}, orgId: '8569880' })
   */
  async request(opts: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    params?: Record<string, any>;
    body?: any;
    orgId?: string;
  }): Promise<any> {
    const config: AxiosRequestConfig = {
      method: opts.method,
      url: opts.path,
      params: opts.params,
      data: opts.body,
      headers: {},
    };

    if (opts.orgId) {
      config.headers!['X-AP-Context'] = `orgId=${opts.orgId}`;
    }

    const response = await this.axiosInstance.request(config);
    return response.data;
  }

  /**
   * Surface Apple's error shape clearly. ASA returns:
   *   { data: null, error: { errors: [{ messageCode, message, field }] } }
   */
  private async handleError(error: AxiosError): Promise<never> {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;
      const errors = data?.error?.errors;
      const msg = Array.isArray(errors) && errors.length
        ? errors.map((e: any) => `${e.messageCode}: ${e.message}${e.field ? ` (${e.field})` : ''}`).join('; ')
        : error.message;
      throw new Error(`ASA API ${status}: ${msg}`);
    }
    throw new Error(`ASA API network error: ${error.message}`);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request({ method: 'GET', path: '/acls' });
      return true;
    } catch {
      return false;
    }
  }
}
