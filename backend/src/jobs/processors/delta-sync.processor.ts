import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CrmConnectorService } from '../../crm-connector/crm-connector.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EventProcessor } from './event.processor';
import { AppException } from '../../common/exceptions/app.exception';
@Injectable()
export class DeltaSyncProcessor {
  private logger = new Logger('DeltaSync');
  constructor(private prisma: PrismaService, private crm: CrmConnectorService, private crypto: CryptoService, private events: EventProcessor) {}
  async runCron() {
    const accounts = await this.prisma.account.findMany({ where: { status: 'connected', backfillStatus: 'done' } });
    for (const account of accounts) {
      try { await this.run(account.id); } catch (e) { this.logger.error(e); }
    }
  }

  async run(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc || !acc.encryptedToken || acc.status !== 'connected' || acc.backfillStatus !== 'done') return;
    const token = this.crypto.decrypt(acc.encryptedToken);
    const jobStartedAt = new Date();
    const windowFrom = acc.lastSyncedAt;
    if (!windowFrom) return;
    let page = 1;
    while (true) {
      const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
        method: 'GET', path: '/api/v4/leads',
        params: { 'filter[updated_at][from]': Math.floor(windowFrom.getTime()/1000), page, limit: 250, with: 'tags' },
      });
      if (resp.status === 401) { await this.markTokenExpired(accountId); return; }
      if (resp.status !== 200) throw new AppException('AMO_CRM_ERROR', 502, `leads: ${resp.status}`);
      const items = resp.data?._embedded?.leads || [];
      for (const amo of items) { try { await this.events.upsertLead(this.prisma, accountId, amo); } catch (e) { this.logger.error(e); } }
      if (!items.length || items.length < 250) break;
      page++;
    }
    const eventGroups = new Map<number, any[]>();
    page = 1;
    while (true) {
      const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
        method: 'GET', path: '/api/v4/events',
        params: {
          'filter[type]': 'lead_status_changed,lead_deleted,lead_restored',
          'filter[created_at][from]': Math.floor(windowFrom.getTime()/1000),
          page, limit: 250,
        },
      });
      if (resp.status === 401) { await this.markTokenExpired(accountId); return; }
      if (resp.status !== 200) throw new AppException('AMO_CRM_ERROR', 502, `events: ${resp.status}`);
      const items = resp.data?._embedded?.events || [];
      for (const ev of items) { const list = eventGroups.get(ev.entity_id) || []; list.push(ev); eventGroups.set(ev.entity_id, list); }
      if (!items.length || items.length < 250) break;
      page++;
    }
    for (const [leadId, list] of eventGroups.entries()) {
      list.sort((a, b) => a.created_at - b.created_at);
      for (const ev of list) {
        try {
          if (ev.type === 'lead_status_changed') await this.events.processStatusChanged(accountId, acc.subdomain, acc.baseDomain, token, ev);
          else if (ev.type === 'lead_deleted') await this.events.processLeadDeleted(accountId, ev);
          else if (ev.type === 'lead_restored') await this.events.processLeadRestored(accountId, acc.subdomain, acc.baseDomain, token, ev);
        } catch (e) { this.logger.error(e); }
      }
      const lead = await this.prisma.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: String(leadId) } } });
      if (lead) { try { await this.events.createFallbackInterval(lead.id); } catch (e) {} }
    }
    const overlap = parseInt(process.env.SYNC_OVERLAP_MINUTES || '2', 10) * 60 * 1000;
    await this.prisma.account.update({ where: { id: accountId }, data: { lastSyncedAt: new Date(jobStartedAt.getTime() - overlap) } });
  }
  private async markTokenExpired(accountId: number) {
    await this.prisma.account.update({ where: { id: accountId }, data: { tokenStatus: 'expired' } });
    await this.prisma.notification.create({ data: { accountId, type: 'token_expired', message: 'amoCRM token has expired. Please update it.' } });
  }
}
