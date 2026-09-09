import { Injectable } from '@nestjs/common';
import Bottleneck from 'bottleneck';
@Injectable()
export class CrmRateLimiter {
  private limiters = new Map<number, Bottleneck>();
  private rps = parseInt(process.env.AMO_CRM_RATE_LIMIT_RPS || '5', 10);
  getForAccount(accountId: number): Bottleneck {
    let l = this.limiters.get(accountId);
    if (!l) {
      l = new Bottleneck({ reservoir: this.rps, reservoirRefreshAmount: this.rps, reservoirRefreshInterval: 1000, maxConcurrent: 1, minTime: 0 });
      this.limiters.set(accountId, l);
    }
    return l;
  }
  remove(accountId: number) {
    const l = this.limiters.get(accountId);
    if (l) { l.disconnect(); this.limiters.delete(accountId); }
  }
}
