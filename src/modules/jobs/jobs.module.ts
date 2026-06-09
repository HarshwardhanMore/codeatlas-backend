import { Module } from '@nestjs/common';

import { ScanProgressConsumer } from './consumers/scan-progress.consumer';
import { RepositoryScanProducer } from './producers/repository-scan.producer';
import { QueueRegistryService } from './queues/queue-registry.service';

@Module({
  exports: [QueueRegistryService, RepositoryScanProducer, ScanProgressConsumer],
  providers: [QueueRegistryService, RepositoryScanProducer, ScanProgressConsumer],
})
export class JobsModule {}
