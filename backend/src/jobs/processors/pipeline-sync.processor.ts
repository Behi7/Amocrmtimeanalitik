import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CrmConnectorService } from '../../crm-connector/crm-connector.service';
import { CryptoService } from '../../common/crypto/crypto.service';
@Injectable()
export class PipelineSyncProcessor {
  private logger = new Logger('PipelineSync');
  constructor(private prisma: PrismaService, private crm: CrmConnectorService, private crypto: CryptoService) {}
  async runCron() {
    const accounts = await this.prisma.account.findMany({ where: { status: 'connected' } });
    for (const a of accounts) { try { await this.run(a.id); } catch (e) { this.logger.error(e); } }
  }
  async run(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc || !acc.encryptedToken) return;
    const token = this.crypto.decrypt(acc.encryptedToken);
    const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, { method: 'GET', path: '/api/v4/leads/pipelines' });
    if (resp.status === 401) {
      await this.prisma.account.update({ where: { id: accountId }, data: { tokenStatus: 'expired' } });
      await this.prisma.notification.create({ data: { accountId, type: 'token_expired', message: 'Token expired' } });
      return;
    }
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
    const pipeIds = pipes.map((x: any) => String(x.id));
    if (pipeIds.length > 0) {
      await this.prisma.pipeline.updateMany({
        where: { accountId, NOT: { externalId: { in: pipeIds } } },
        data: { isArchived: true },
      });
    }
  }
}
