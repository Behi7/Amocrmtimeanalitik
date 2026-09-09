import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobSchedulerService } from './job-scheduler.service';
@Injectable()
export class JobsBootstrapService implements OnModuleInit {
  private logger = new Logger('JobsBootstrap');
  constructor(private prisma: PrismaService, private scheduler: JobSchedulerService) {}
  async onModuleInit() {
    const accounts = await this.prisma.account.findMany({ where: { status: 'connected' } });
    for (const a of accounts) {
      if (['pending','in_progress','failed'].includes(a.backfillStatus)) {
        await this.scheduler.startBackfill(a.id);
        this.logger.log(`Restarted backfill for account ${a.id}`);
      }
    }
  }
}
