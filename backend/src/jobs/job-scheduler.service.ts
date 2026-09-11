import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
export const QUEUE_NAME = 'sync';
@Injectable()
export class JobSchedulerService implements OnModuleInit {
  private logger = new Logger('JobScheduler');
  constructor(@InjectQueue(QUEUE_NAME) private queue: Queue) {}
  async onModuleInit() {
    const syncEveryMinutes = parseInt(process.env.SYNC_INTERVAL_MINUTES || '10', 10);
    await this.queue.add('pipeline-sync-cron', { type: 'pipeline-sync-cron' }, { repeat: { every: 24*60*60*1000 }, jobId: 'pipeline-sync-cron' });
    await this.queue.add('token-expiry-cron', { type: 'token-expiry-cron' }, { repeat: { every: 24*60*60*1000 }, jobId: 'token-expiry-cron' });
    await this.queue.add('delta-sync-cron', { type: 'delta-sync-cron' }, { repeat: { every: syncEveryMinutes * 60 * 1000 }, jobId: 'delta-sync-cron' });
  }
  async startBackfill(accountId: number) {
    const jobs = await this.queue.getJobs(['waiting', 'delayed', 'failed', 'completed']);
    for (const j of jobs) {
      if (j.data?.type === 'backfill' && j.data?.accountId === accountId) {
        try { await j.remove(); } catch (e) { this.logger.warn(`Could not remove old job ${j.id}: ${e}`); }
      }
    }
    return this.queue.add(
      'backfill',
      { accountId, type: 'backfill' },
      { jobId: `backfill-${accountId}-${Date.now()}`, removeOnComplete: true, removeOnFail: 100 },
    );
  }
  async stopAccountJobs(accountId: number) {
    const jobs = await this.queue.getJobs(['waiting','active','delayed']);
    for (const j of jobs) { if (j.data?.accountId === accountId) await j.remove(); }
  }
}
