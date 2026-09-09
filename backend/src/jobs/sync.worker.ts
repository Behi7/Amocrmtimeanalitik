import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DeltaSyncProcessor } from './processors/delta-sync.processor';
import { PipelineSyncProcessor } from './processors/pipeline-sync.processor';
import { BackfillProcessor } from './processors/backfill.processor';
import { TokenExpiryProcessor } from './processors/token-expiry.processor';
import { PrismaService } from '../common/prisma/prisma.service';
import { QUEUE_NAME } from './job-scheduler.service';
@Processor(QUEUE_NAME, { concurrency: parseInt(process.env.GLOBAL_SYNC_CONCURRENCY || '3', 10) })
export class SyncWorker extends WorkerHost {
  private logger = new Logger('SyncWorker');
  constructor(
    private delta: DeltaSyncProcessor,
    private pipeline: PipelineSyncProcessor,
    private backfill: BackfillProcessor,
    private token: TokenExpiryProcessor,
    private prisma: PrismaService,
  ) { super(); }
  async process(job: Job) {
    switch (job.data?.type) {
      case 'backfill': return this.backfill.run(job.data.accountId, job);
      case 'delta': return this.delta.run(job.data.accountId);
      case 'pipeline': return this.pipeline.run(job.data.accountId);
      case 'pipeline-sync-cron': return this.pipeline.runCron();
      case 'token-expiry-cron': return this.token.run();
    }
  }
  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error) {
    if (job?.data?.type === 'backfill' && job.data.accountId) {
      this.prisma.account.update({
        where: { id: job.data.accountId },
        data: { backfillStatus: 'failed', backfillError: err.message, backfillErrorAt: new Date() },
      }).catch(e => this.logger.error(e));
    }
  }
}
