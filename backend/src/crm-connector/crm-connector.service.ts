import { Injectable, Logger } from '@nestjs/common';
import { CrmRateLimiter } from './http/rate-limiter';
import { CryptoService } from '../common/crypto/crypto.service';
import { AppException } from '../common/exceptions/app.exception';

export interface AmoRequest { method: 'GET'|'POST'|'PATCH'|'DELETE'; path: string; params?: Record<string, any>; body?: any; }
export interface AmoResponse<T = any> { status: number; data: T; retryAfter?: number; }

@Injectable()
export class CrmConnectorService {
  private logger = new Logger('CrmConnector');
  constructor(private limiter: CrmRateLimiter, private crypto: CryptoService) {}
  buildBaseUrl(subdomain: string, baseDomain: string): string { return `https://${subdomain}.${baseDomain}`; }
  decryptToken(encrypted: string): string { return this.crypto.decrypt(encrypted); }
  encryptToken(plain: string): string { return this.crypto.encrypt(plain); }

  async request<T = any>(accountId: number, subdomain: string, baseDomain: string, token: string, req: AmoRequest, retries = 5): Promise<AmoResponse<T>> {
    const lim = accountId > 0 ? this.limiter.getForAccount(accountId) : null;
    const url = this.buildBaseUrl(subdomain, baseDomain) + req.path;
    let lastErr: any;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const fn = async () => {
          const qs = req.params ? '?' + new URLSearchParams(this.flatten(req.params)).toString() : '';
          const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
          if (req.body) headers['Content-Type'] = 'application/json';
          const r = await fetch(url + qs, { method: req.method, headers, body: req.body ? JSON.stringify(req.body) : undefined });
          const retryAfter = r.headers.get('retry-after');
          let data: any = null;
          const text = await r.text();
          if (text) try { data = JSON.parse(text); } catch { data = text; }
          return { status: r.status, data, retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined };
        };
        const resp = lim ? await lim.schedule(fn) : await fn();
        if (resp.status === 429) {
          const wait = (resp.retryAfter || Math.pow(2, attempt)) * 1000;
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        if ([502, 503, 504].includes(resp.status)) {
          this.logger.warn(`amoCRM transient gateway error ${resp.status} on attempt ${attempt + 1}/${retries}, retrying...`);
          const wait = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        if (resp.status === 500) {
          this.logger.error(`amoCRM internal server error 500 on ${req.method} ${url}: ${JSON.stringify(resp.data)}`);
          return resp as AmoResponse<T>;
        }
        return resp as AmoResponse<T>;
      } catch (e: any) {
        lastErr = e;
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
    throw new AppException('AMO_CRM_ERROR', 502, `amoCRM request failed: ${lastErr?.message || 'unknown'}`);
  }

  private flatten(p: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (v === null || v === undefined) continue;
      if (typeof v === 'object' && !Array.isArray(v)) {
        for (const sk of Object.keys(v)) out[`${k}[${sk}]`] = String(v[sk]);
      } else if (Array.isArray(v)) out[k] = v.join(',');
      else out[k] = String(v);
    }
    return out;
  }
}
