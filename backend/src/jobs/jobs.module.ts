import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobSchedulerService, QUEUE_NAME } from './job-scheduler.service';
import { JobsBootstrapService } from './jobs-bootstrap.service';
import { DeltaSyncProcessor } from './processors/delta-sync.processor';
import { PipelineSyncProcessor } from './processors/pipeline-sync.processor';
import { BackfillProcessor } from './processors/backfill.processor';
import { TokenExpiryProcessor } from './processors/token-expiry.processor';
import { EventProcessor } from './processors/event.processor';
import { SyncWorker } from './sync.worker';
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAME })],
  providers: [JobSchedulerService, JobsBootstrapService, EventProcessor, DeltaSyncProcessor, PipelineSyncProcessor, BackfillProcessor, TokenExpiryProcessor, SyncWorker],
  exports: [JobSchedulerService],
})
export class JobsModule {}
