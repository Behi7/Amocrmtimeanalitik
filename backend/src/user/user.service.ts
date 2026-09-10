import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { join, Sql, sqltag } from '@prisma/client/runtime/library';
@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}
  private async freshness(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) throw new NotFoundException();
    const staleMs = parseInt(process.env.STALE_THRESHOLD_MINUTES || '30', 10) * 60 * 1000;
    const isStale = !acc.lastSyncedAt || (Date.now() - acc.lastSyncedAt.getTime() > staleMs) || acc.backfillStatus !== 'done';
    return { dataFreshness: { lastSyncedAt: acc.lastSyncedAt?.toISOString() ?? null, isStale } };
  }
  async getPipelines(accountId: number) {
    const items = await this.prisma.pipeline.findMany({ where: { accountId, isArchived: false }, orderBy: { id: 'asc' } });
    return { ...await this.freshness(accountId), items };
  }
  async getTags(accountId: number) {
    const items = await this.prisma.tag.findMany({
      where: { accountId, leadTags: { some: {} }, isArchived: false }, orderBy: { name: 'asc' },
    });
    return { ...await this.freshness(accountId), items };
  }
  async getStagesStats(pipelineId: number, tagIds?: number[]) {
    const pipeline = await this.prisma.pipeline.findUnique({ where: { id: pipelineId }, include: { stages: true } });
    if (!pipeline) throw new NotFoundException();
    const accountId = pipeline.accountId;
    const tagFilter = this.buildTagFilter(tagIds);
    const stages = await this.prisma.stage.findMany({ where: { pipelineId, isArchived: false }, orderBy: { sortOrder: 'asc' } });
    const result: any[] = [];
    for (const s of stages) {
      const actual = await this.prisma.$queryRaw<any[]>`
        SELECT COALESCE(AVG(CASE WHEN h.exited_at IS NULL THEN EXTRACT(EPOCH FROM (now() - h.entered_at)) ELSE h.duration_seconds END),0)::float as avg_seconds,
          COUNT(h.id)::int as closed_count, COUNT(h.id) FILTER (WHERE h.exited_at IS NULL)::int as active_count, COUNT(DISTINCT h.lead_id)::int as unique_leads
        FROM lead_stage_history h JOIN leads l ON l.id = h.lead_id
        WHERE h.stage_id = ${s.id}::int AND l.status <> 'gone' ${tagFilter}`;
      const skips = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as cnt FROM lead_stage_skips sk JOIN leads l ON l.id = sk.lead_id
        WHERE sk.skipped_stage_id = ${s.id}::int AND l.status <> 'gone' ${tagFilter}`;
      const active = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(h.id)::int as cnt, COALESCE(AVG(EXTRACT(EPOCH FROM (now() - h.entered_at))),0)::float as avg_active
        FROM lead_stage_history h JOIN leads l ON l.id = h.lead_id
        WHERE h.stage_id = ${s.id}::int AND h.exited_at IS NULL AND l.status <> 'gone' ${tagFilter}`;
      const avg = Number(actual[0].avg_seconds);
      const closedCount = Number(actual[0].closed_count) - Number(actual[0].active_count);
      const activeHistoryCount = Number(actual[0].active_count);
      const skipsCount = Number(skips[0].cnt);
      let activeCount = Number(active[0].cnt);
      if (s.externalId === '142' || s.externalId === '143') {
        const terminalStatus = s.externalId === '142' ? 'won' : 'lost';
        const terminal = await this.prisma.$queryRaw<any[]>`
          SELECT COUNT(*)::int AS cnt FROM leads l
          WHERE l.pipeline_id = ${pipelineId}::int AND l.status = ${terminalStatus}::text ${tagFilter}`;
        activeCount = Number(terminal[0].cnt);
      }
      const avgIncluding = (closedCount + skipsCount) > 0 ? Math.round((avg * closedCount) / (closedCount + skipsCount)) : 0;
      result.push({
        stageId: s.id.toString(), name: s.name, sortOrder: s.sortOrder,
        avgSecondsActual: Math.round(avg), avgSecondsIncludingSkips: avgIncluding,
        skipsCount, activeLeadsCount: activeCount, activeHistoryCount,
      });
    }
    return { ...await this.freshness(accountId), items: result };
  }
  async getActiveLeads(stageId: number, page = 1, perPage = 50, tagIds?: number[]) {
    const stage = await this.prisma.stage.findUnique({ where: { id: stageId }, include: { pipeline: true } });
    if (!stage) throw new NotFoundException();
    const tagFilter = this.buildTagFilter(tagIds);
    const isTerminal = stage.externalId === '142' || stage.externalId === '143';
    const terminalStatus = stage.externalId === '142' ? 'won' : 'lost';
    const rows = isTerminal
      ? await this.prisma.$queryRaw<any[]>`
        SELECT l.id::text, l.external_id::text, l.name, l.crm_closed_at AS entered_at, l.status, l.price::text
        FROM leads l
        WHERE l.pipeline_id = ${stage.pipelineId}::int AND l.status = ${terminalStatus}::text ${tagFilter}
        ORDER BY l.crm_closed_at DESC LIMIT ${perPage}::int OFFSET ${((page-1)*perPage)}::int`
      : await this.prisma.$queryRaw<any[]>`
        SELECT l.id::text, l.external_id::text, l.name, h.entered_at, l.status, l.price::text
        FROM lead_stage_history h JOIN leads l ON l.id = h.lead_id
        WHERE h.stage_id = ${stageId}::int AND h.exited_at IS NULL AND l.status <> 'gone' ${tagFilter}
        ORDER BY h.entered_at ASC LIMIT ${perPage}::int OFFSET ${((page-1)*perPage)}::int`;
    const totalRows = isTerminal
      ? await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as c FROM leads l
        WHERE l.pipeline_id = ${stage.pipelineId}::int AND l.status = ${terminalStatus}::text ${tagFilter}`
      : await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as c FROM lead_stage_history h JOIN leads l ON l.id = h.lead_id
        WHERE h.stage_id = ${stageId}::int AND h.exited_at IS NULL AND l.status <> 'gone' ${tagFilter}`;
    return { ...await this.freshness(stage.pipeline.accountId), items: rows, page, perPage, total: Number(totalRows[0].c) };
  }
  async getLeadHistory(leadId: number) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, include: { leadTags: { include: { tag: true } } } });
    if (!lead) throw new NotFoundException();
    const history = await this.prisma.$queryRaw<any[]>`
      SELECT s.name as stage_name, s.external_id::text, h.entered_at, h.exited_at,
        CASE WHEN h.exited_at IS NULL THEN EXTRACT(EPOCH FROM (now() - h.entered_at))::int ELSE h.duration_seconds END AS duration_seconds
      FROM lead_stage_history h JOIN stages s ON s.id = h.stage_id
      WHERE h.lead_id = ${leadId}::int ORDER BY h.entered_at ASC`;
    const skips = await this.prisma.$queryRaw<any[]>`
      SELECT sk.source_event_id::text, sk.transition_at, sk.direction,
        fs.name as from_stage_name, ts.name as to_stage_name, ss.name as skipped_stage_name
      FROM lead_stage_skips sk
      JOIN stages fs ON fs.id = sk.from_stage_id JOIN stages ts ON ts.id = sk.to_stage_id JOIN stages ss ON ss.id = sk.skipped_stage_id
      WHERE sk.lead_id = ${leadId}::int ORDER BY sk.transition_at ASC`;
    const leadData: any = { ...lead };
    if (leadData.price != null) leadData.price = leadData.price.toString();
    return { ...await this.freshness(lead.accountId), lead: leadData, history, skips };
  }
  async searchLeads(accountId: number, q: string, page = 1, perPage = 50, tagIds?: number[]) {
    if (q.length < 2) return { ...await this.freshness(accountId), items: [], page, perPage, total: 0 };
    const like = `%${q.replace(/%/g,'\\%').replace(/_/g,'\\_')}%`;
    const tagFilter = this.buildTagFilter(tagIds);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT l.id::text, l.external_id::text, l.name, l.status, l.price::text, l.crm_created_at, l.crm_closed_at
      FROM leads l WHERE l.account_id = ${accountId}::int AND l.status <> 'gone' AND l.name ILIKE ${like}::text ${tagFilter}
      ORDER BY l.crm_created_at DESC LIMIT ${perPage}::int OFFSET ${((page-1)*perPage)}::int`;
    const totalRows = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int as c FROM leads l WHERE l.account_id = ${accountId}::int AND l.status <> 'gone' AND l.name ILIKE ${like}::text ${tagFilter}`;
    return { ...await this.freshness(accountId), items: rows, page, perPage, total: Number(totalRows[0].c) };
  }
  async listLeadsByStatus(accountId: number, status: string, page = 1, perPage = 50, tagIds?: number[]) {
    const tagFilter = this.buildTagFilter(tagIds);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT l.id::text, l.external_id::text, l.name, l.status, l.price::text, l.crm_created_at, l.crm_closed_at
      FROM leads l WHERE l.account_id = ${accountId}::int AND l.status = ${status}::text ${tagFilter}
      ORDER BY l.crm_created_at DESC LIMIT ${perPage}::int OFFSET ${((page-1)*perPage)}::int`;
    const totalRows = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int as c FROM leads l WHERE l.account_id = ${accountId}::int AND l.status = ${status}::text ${tagFilter}`;
    return { ...await this.freshness(accountId), items: rows, page, perPage, total: Number(totalRows[0].c) };
  }
  private buildTagFilter(tagIds?: number[]): Sql {
    if (!tagIds || tagIds.length === 0) return sqltag``;
    const count = tagIds.length;
    const arr = sqltag`ARRAY[${join(tagIds.map(t => sqltag`${t}`), ',')}]::int[]`;
    return sqltag`
      AND EXISTS (
        SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = ANY(${arr})
        GROUP BY lt.lead_id HAVING COUNT(DISTINCT lt.tag_id) = ${count}::int
      )`;
  }
}
