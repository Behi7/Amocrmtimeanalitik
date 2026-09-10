import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrismaClient } from '@prisma/client';
import { CrmConnectorService } from '../../crm-connector/crm-connector.service';

export interface CrmEvent { id: number; type: string; entity_id: number; created_at: number; value_after?: any; value_before?: any; }
export interface AmoLead { id: number; name: string; status_id: number; pipeline_id: number; created_at: number; updated_at: number; closed_at?: number; price: number|string; _embedded?: { tags?: Array<{id: number; name: string}> }; }

@Injectable()
export class EventProcessor {
  private logger = new Logger('EventProcessor');
  constructor(private prisma: PrismaService, private crm: CrmConnectorService) {}

  private extractStatusInfo(v: any): { statusId: number; pipelineId?: number } | null {
    if (!v) return null;
    if (typeof v === 'string') {
      try { return this.extractStatusInfo(JSON.parse(v)); } catch { return null; }
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        const status = this.extractStatusInfo(item);
        if (status) return status;
      }
      return null;
    }
    if (typeof v !== 'object') return null;
    if (v.lead_status?.id != null) {
      return { statusId: Number(v.lead_status.id), pipelineId: v.lead_status.pipeline_id != null ? Number(v.lead_status.pipeline_id) : undefined };
    }
    if (v.status_id != null) return { statusId: Number(v.status_id), pipelineId: v.pipeline_id != null ? Number(v.pipeline_id) : undefined };
    if (v.statusId != null) return { statusId: Number(v.statusId), pipelineId: v.pipelineId != null ? Number(v.pipelineId) : undefined };
    if (v.pipeline_id != null && v.id != null) return { statusId: Number(v.id), pipelineId: Number(v.pipeline_id) };
    if (v.value != null) return this.extractStatusInfo(v.value);
    return null;
  }

  async upsertLead(tx: PrismaClient, accountId: number, amo: AmoLead) {
    const pipeline = await tx.pipeline.findFirst({ where: { accountId, externalId: String(amo.pipeline_id) } });
    let stageId: number | null = null;
    if (pipeline) {
      const st = await tx.stage.findFirst({ where: { pipelineId: pipeline.id, externalId: String(amo.status_id) } });
      stageId = st?.id ?? null;
    }
    let status: string = 'open';
    let closed: Date | null = null;
    if (amo.status_id === 142) { status = 'won'; closed = amo.closed_at ? new Date(amo.closed_at * 1000) : null; }
    else if (amo.status_id === 143) { status = 'lost'; closed = amo.closed_at ? new Date(amo.closed_at * 1000) : null; }
    const priceNum = amo.price != null ? Number(amo.price) : null;
    const lead = await tx.lead.upsert({
      where: { accountId_externalId: { accountId, externalId: String(amo.id) } },
      create: {
        accountId, externalId: String(amo.id), name: amo.name || null,
        pipelineId: pipeline?.id ?? null, currentStageId: stageId,
        status, price: priceNum != null ? priceNum as any : null,
        crmCreatedAt: new Date(amo.created_at * 1000),
        crmClosedAt: closed, updatedAt: new Date(amo.updated_at * 1000),
      },
      update: {
        name: amo.name || null,
        pipelineId: pipeline?.id ?? null, currentStageId: stageId,
        status, crmClosedAt: closed, updatedAt: new Date(amo.updated_at * 1000),
      },
    });
    if (amo._embedded?.tags) {
      const tagIds: number[] = [];
      for (const t of amo._embedded.tags) {
        const tag = await tx.tag.upsert({
          where: { accountId_externalId: { accountId, externalId: String(t.id) } },
          create: { accountId, externalId: String(t.id), name: t.name },
          update: { name: t.name },
        });
        tagIds.push(tag.id);
      }
      await tx.leadTag.deleteMany({ where: { leadId: lead.id } });
      if (tagIds.length > 0) {
        await tx.leadTag.createMany({ data: tagIds.map(tid => ({ leadId: lead.id, tagId: tid })) });
      }
    }
    return lead;
  }

  async processStatusChanged(accountId: number, subdomain: string, baseDomain: string, token: string, event: CrmEvent) {
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${accountId + '-' + event.entity_id})::bigint)`;
    const existing = await this.prisma.processedCrmEvent.findUnique({
      where: { accountId_externalEventId: { accountId, externalEventId: String(event.id) } },
    });
    if (existing) return;
    const leadExtId = String(event.entity_id);
    let lead = await this.prisma.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: leadExtId } } });
    if (!lead) {
      const resp = await this.crm.request<any>(accountId, subdomain, baseDomain, token, {
        method: 'GET', path: `/api/v4/leads/${event.entity_id}`, params: { with: 'tags' },
      });
      if (resp.status !== 200) {
        await this.prisma.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_lead' } });
        return;
      }
      lead = await this.upsertLead(this.prisma, accountId, resp.data);
    }
    const ts = new Date(event.created_at * 1000);
    const statusInfo = this.extractStatusInfo(event.value_after);
    const statusAfter = statusInfo?.statusId ?? null;
    let result = 'processed';
    if (statusAfter === 142 || statusAfter === 143) {
      let open = await this.prisma.leadStageHistory.findFirst({ where: { leadId: lead.id, exitedAt: null } });
      if (!open) {
        const previousStatus = this.extractStatusInfo(event.value_before);
        if (previousStatus) {
          const previousStage = previousStatus.pipelineId != null
            ? await this.prisma.stage.findFirst({ where: { pipeline: { accountId, externalId: String(previousStatus.pipelineId) }, externalId: String(previousStatus.statusId) } })
            : await this.prisma.stage.findFirst({ where: { pipeline: { accountId }, externalId: String(previousStatus.statusId) } });
          if (previousStage) {
            open = await this.prisma.leadStageHistory.create({
              data: { leadId: lead.id, stageId: previousStage.id, enteredAt: lead.crmCreatedAt, exitedAt: null },
            });
          }
        }
      }
      if (open) {
        const dur = Math.max(0, Math.floor((ts.getTime() - open.enteredAt.getTime()) / 1000));
        await this.prisma.leadStageHistory.update({ where: { id: open.id }, data: { exitedAt: ts, durationSeconds: dur } });
      }
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { status: statusAfter === 142 ? 'won' : 'lost', crmClosedAt: ts, updatedAt: ts, currentStageId: null },
      });
      result = statusAfter === 142 ? 'closed_won' : 'closed_lost';
    } else {
      if (statusAfter == null) {
        await this.prisma.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_stage' } });
        return;
      }
      let stage = statusInfo?.pipelineId != null
        ? await this.prisma.stage.findFirst({ where: { pipeline: { accountId, externalId: String(statusInfo.pipelineId) }, externalId: String(statusAfter) } })
        : await this.prisma.stage.findFirst({ where: { pipeline: { accountId }, externalId: String(statusAfter) } });
      if (!stage) {
        const pipeline = statusInfo?.pipelineId != null
          ? await this.prisma.pipeline.findUnique({ where: { accountId_externalId: { accountId, externalId: String(statusInfo.pipelineId) } } })
          : null;
        if (pipeline) {
          stage = await this.prisma.stage.create({
            data: { pipelineId: pipeline.id, externalId: String(statusAfter), name: `Архивный этап ${statusAfter}`, isArchived: true },
          });
        } else {
          await this.prisma.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_stage' } });
          return;
        }
      }
      const open = await this.prisma.leadStageHistory.findFirst({ where: { leadId: lead.id, exitedAt: null } });
      if (open && open.stageId !== stage.id) {
        const dur = Math.max(0, Math.floor((ts.getTime() - open.enteredAt.getTime()) / 1000));
        await this.prisma.leadStageHistory.update({ where: { id: open.id }, data: { exitedAt: ts, durationSeconds: dur } });
        const fromStage = await this.prisma.stage.findUnique({ where: { id: open.stageId } });
        if (fromStage && fromStage.pipelineId === stage.pipelineId && fromStage.sortOrder != null && stage.sortOrder != null) {
          const diff = stage.sortOrder - fromStage.sortOrder;
          if (Math.abs(diff) > 1) {
            const dir = diff > 0 ? 'forward' : 'backward';
            const lo = Math.min(fromStage.sortOrder, stage.sortOrder);
            const hi = Math.max(fromStage.sortOrder, stage.sortOrder);
            const between = await this.prisma.stage.findMany({
              where: { pipelineId: fromStage.pipelineId, sortOrder: { gt: lo, lt: hi }, isArchived: false },
            });
            for (const sk of between) {
              await this.prisma.leadStageSkip.upsert({
                where: { leadId_sourceEventId_skippedStageId: { leadId: lead.id, sourceEventId: String(event.id), skippedStageId: sk.id } },
                create: {
                  accountId, leadId: lead.id, pipelineId: fromStage.pipelineId,
                  sourceEventId: String(event.id), transitionAt: ts,
                  fromStageId: fromStage.id, toStageId: stage.id, skippedStageId: sk.id, direction: dir,
                },
                update: {},
              });
            }
          }
        }
      }
      if (!open || open.stageId !== stage.id) {
        await this.prisma.leadStageHistory.create({
          data: { leadId: lead.id, stageId: stage.id, enteredAt: ts, exitedAt: null, sourceEventId: String(event.id) },
        });
      }
      const updates: any = { currentStageId: stage.id, updatedAt: ts };
      if (lead.status === 'won' || lead.status === 'lost') { updates.status = 'open'; updates.crmClosedAt = null; }
      await this.prisma.lead.update({ where: { id: lead.id }, data: updates });
    }
    await this.prisma.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result } });
  }

  async processLeadDeleted(accountId: number, event: CrmEvent) {
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${accountId + '-' + event.entity_id})::bigint)`;
    const existing = await this.prisma.processedCrmEvent.findUnique({
      where: { accountId_externalEventId: { accountId, externalEventId: String(event.id) } },
    });
    if (existing) return;
    const leadExtId = String(event.entity_id);
    const lead = await this.prisma.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: leadExtId } } });
    if (!lead) {
      await this.prisma.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_lead' } });
      return;
    }
    const ts = new Date(event.created_at * 1000);
    const open = await this.prisma.leadStageHistory.findFirst({ where: { leadId: lead.id, exitedAt: null } });
    if (open) {
      const dur = Math.max(0, Math.floor((ts.getTime() - open.enteredAt.getTime()) / 1000));
      await this.prisma.leadStageHistory.update({ where: { id: open.id }, data: { exitedAt: ts, durationSeconds: dur } });
    }
    await this.prisma.lead.update({ where: { id: lead.id }, data: { status: 'gone', updatedAt: ts } });
    await this.prisma.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'deleted' } });
  }

  async processLeadRestored(accountId: number, subdomain: string, baseDomain: string, token: string, event: CrmEvent) {
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${accountId + '-' + event.entity_id})::bigint)`;
    const existing = await this.prisma.processedCrmEvent.findUnique({
      where: { accountId_externalEventId: { accountId, externalEventId: String(event.id) } },
    });
    if (existing) return;
    const leadExtId = String(event.entity_id);
    let lead = await this.prisma.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: leadExtId } } });
    if (!lead) {
      const resp = await this.crm.request<any>(accountId, subdomain, baseDomain, token, {
        method: 'GET', path: `/api/v4/leads/${event.entity_id}`, params: { with: 'tags' },
      });
      if (resp.status !== 200) {
        await this.prisma.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_lead' } });
        return;
      }
      lead = await this.upsertLead(this.prisma, accountId, resp.data);
    }
    const ts = new Date(event.created_at * 1000);
    await this.prisma.lead.update({ where: { id: lead.id }, data: { updatedAt: ts } });
    if (lead.currentStageId && !lead.crmClosedAt) {
      await this.prisma.leadStageHistory.create({
        data: { leadId: lead.id, stageId: lead.currentStageId, enteredAt: ts, exitedAt: null, sourceEventId: String(event.id) },
      });
    }
    await this.prisma.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'restored' } });
  }

  async createFallbackInterval(leadId: number) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.currentStageId) return;
    const existing = await this.prisma.leadStageHistory.findFirst({ where: { leadId } });
    if (existing) return;
    const closed = lead.crmClosedAt;
    await this.prisma.leadStageHistory.create({
      data: {
        leadId, stageId: lead.currentStageId, enteredAt: lead.crmCreatedAt, exitedAt: closed,
        durationSeconds: closed ? Math.floor((closed.getTime() - lead.crmCreatedAt.getTime()) / 1000) : null,
      },
    });
  }
}
