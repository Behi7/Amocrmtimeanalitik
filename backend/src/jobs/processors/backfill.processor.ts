import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CrmConnectorService } from '../../crm-connector/crm-connector.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EventProcessor } from './event.processor';
import { Job } from 'bullmq';
@Injectable()
export class BackfillProcessor {
  private logger = new Logger('Backfill');
  constructor(private prisma: PrismaService, private crm: CrmConnectorService, private crypto: CryptoService, private events: EventProcessor) {}

  async run(accountId: number, job: Job) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc || !acc.encryptedToken) return;
    const token = this.crypto.decrypt(acc.encryptedToken);
    await this.prisma.account.update({ where: { id: accountId }, data: { backfillStatus: 'in_progress', backfillError: null, backfillErrorAt: null } });
    const startedAt = new Date();
    try {
      const accResp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, { method: 'GET', path: '/api/v4/account' });
      if (accResp.status === 401) { await this.fail(accountId, 'Token expired'); return; }
      if (accResp.status !== 200) { await this.fail(accountId, `Account: ${accResp.status}`); return; }
      const tz = this.normalizeTz(accResp.data?.timezone);
      await this.prisma.account.update({ where: { id: accountId }, data: { timezone: tz, externalAccountId: String(accResp.data.id) } });
      await this.syncPipelines(accountId, acc, token);
      const cursor: any = (acc.backfillCursor as any) || { phase: 'leads', page: 1, limit: 250, backfillStartedAt: startedAt.toISOString() };

      if (cursor.phase === 'leads') {
        let page = cursor.page;
        while (true) {
          const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
            method: 'GET', path: '/api/v4/leads', params: { page, limit: cursor.limit, with: 'tags' },
          });
          if (resp.status === 401) { await this.fail(accountId, 'Token expired'); return; }
          if (resp.status !== 200 && resp.status !== 204) { await this.fail(accountId, `Leads: ${resp.status}`); return; }
          const items = resp.status === 204 ? [] : (resp.data?._embedded?.leads || []);
          for (const amo of items) { try { await this.events.upsertLead(this.prisma, accountId, amo); } catch (e) { this.logger.error(e); } }
          await this.saveCursor(accountId, { ...cursor, page });
          if (!items.length || items.length < cursor.limit) { cursor.phase = 'events'; cursor.page = 1; await this.saveCursor(accountId, cursor); break; }
          page++;
        }
      }

      if (cursor.phase === 'events') {
        const groups = new Map<number, any[]>();
        let page = 1;
        while (true) {
          const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
            method: 'GET', path: '/api/v4/events',
            params: { 'filter[type]': 'lead_status_changed', page, limit: 250 },
          });
          if (resp.status === 401) { await this.fail(accountId, 'Token expired'); return; }
          if (resp.status !== 200 && resp.status !== 204) { await this.fail(accountId, `Events: ${resp.status}`); return; }
          const items = resp.status === 204 ? [] : (resp.data?._embedded?.events || []);
          for (const ev of items) {
            const list = groups.get(ev.entity_id) || [];
            // Keep only needed fields to avoid memory leaks
            list.push({
              id: ev.id,
              type: ev.type,
              entity_id: ev.entity_id,
              created_at: ev.created_at,
              value_after: ev.value_after,
              value_before: ev.value_before,
            });
            groups.set(ev.entity_id, list);
          }
          if (!items.length || items.length < 250) break;
          page++;
        }
        for (const [lid, list] of groups.entries()) {
          list.sort((a, b) => (a.created_at - b.created_at) || (a.id - b.id));
          for (const ev of list) {
            try { await this.events.processStatusChanged(accountId, acc.subdomain, acc.baseDomain, token, ev); } catch (e) { this.logger.error(e); }
          }
          const lead = await this.prisma.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: String(lid) } } });
          if (lead) { try { await this.events.createFallbackInterval(lead.id); } catch (e) {} }
        }
        cursor.phase = 'deleted_events';
        cursor.page = 1;
        await this.saveCursor(accountId, cursor);
      }

      if (cursor.phase === 'deleted_events') {
        let page = 1;
        while (true) {
          const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
            method: 'GET', path: '/api/v4/events',
            params: { 'filter[type]': 'lead_deleted,lead_restored', page, limit: 250 },
          });
          if (resp.status === 401) { await this.fail(accountId, 'Token expired'); return; }
          if (resp.status !== 200 && resp.status !== 204) { await this.fail(accountId, `Deleted: ${resp.status}`); return; }
          const items = resp.status === 204 ? [] : (resp.data?._embedded?.events || []);
          for (const ev of items) {
            try {
              if (ev.type === 'lead_deleted') await this.events.processLeadDeleted(accountId, ev);
              else if (ev.type === 'lead_restored') await this.events.processLeadRestored(accountId, acc.subdomain, acc.baseDomain, token, ev);
            } catch (e) { this.logger.error(e); }
          }
          if (!items.length || items.length < 250) break;
          page++;
        }
      }

      // Bulk create fallback intervals for all leads without any stage history in one query
      await this.prisma.$executeRaw`
        INSERT INTO lead_stage_history (lead_id, stage_id, entered_at, exited_at, duration_seconds)
        SELECT 
          l.id, 
          l.current_stage_id, 
          l.crm_created_at, 
          l.crm_closed_at,
          CASE 
            WHEN l.crm_closed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at))::int)
            ELSE NULL 
          END
        FROM leads l
        WHERE l.account_id = ${accountId}
          AND l.current_stage_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM lead_stage_history h WHERE h.lead_id = l.id
          )
      `;

      const overlap = parseInt(process.env.SYNC_OVERLAP_MINUTES || '2', 10) * 60 * 1000;
      await this.prisma.account.update({
        where: { id: accountId },
        data: {
          backfillStatus: 'done', backfillError: null, backfillErrorAt: null,
          lastSyncedAt: new Date(startedAt.getTime() - overlap),
          backfillCursor: { phase: 'done', completedAt: new Date().toISOString() },
        },
      });
    } catch (e: any) {
      await this.fail(accountId, e?.message || 'Unknown');
      throw e;
    }
  }

  private async syncPipelines(accountId: number, acc: any, token: string) {
    const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, { method: 'GET', path: '/api/v4/leads/pipelines' });
    if (resp.status !== 200) return;
    const pipes = resp.data?._embedded?.pipelines || resp.data || [];
    for (const p of pipes) {
      const pipeline = await this.prisma.pipeline.upsert({
        where: { accountId_externalId: { accountId, externalId: String(p.id) } },
        create: { accountId, externalId: String(p.id), name: p.name, isArchived: false },
        update: { name: p.name, isArchived: false },
      });
      const rawStatuses = p._embedded?.statuses || [];
      const stages = rawStatuses.filter((s: any) => String(s.id) !== '142' && String(s.id) !== '143');
      for (const s of stages) {
        await this.prisma.stage.upsert({
          where: { pipelineId_externalId: { pipelineId: pipeline.id, externalId: String(s.id) } },
          create: { pipelineId: pipeline.id, externalId: String(s.id), name: s.name, sortOrder: s.sort ?? s.sort_order ?? 0, isArchived: false },
          update: { name: s.name, sortOrder: s.sort ?? s.sort_order ?? 0, isArchived: false },
        });
      }
      const stageIds = stages.map((x: any) => String(x.id));
      if (stageIds.length > 0) {
        await this.prisma.stage.updateMany({
          where: { pipelineId: pipeline.id, NOT: { externalId: { in: stageIds } } },
          data: { isArchived: true },
        });
      }
    }
  }

  private async saveCursor(accountId: number, cursor: any) {
    await this.prisma.account.update({ where: { id: accountId }, data: { backfillCursor: cursor } });
  }

  private async fail(accountId: number, err: string) {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { backfillStatus: 'failed', backfillError: err, backfillErrorAt: new Date() },
    });
    if (err.includes('expired')) {
      await this.prisma.account.update({ where: { id: accountId }, data: { tokenStatus: 'expired' } });
      await this.prisma.notification.create({ data: { accountId, type: 'token_expired', message: 'Token expired during backfill' } });
    }
  }

  private normalizeTz(tz: string | undefined) {
    if (!tz) return 'UTC';
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return tz; } catch { return 'UTC'; }
  }
}
