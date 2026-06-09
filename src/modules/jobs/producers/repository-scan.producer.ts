import { Injectable } from '@nestjs/common';

import { QueueRegistryService } from '../queues/queue-registry.service';
import { QUEUE_NAMES, REPOSITORY_SCAN_JOB_NAME } from '../queues/queue.constants';

import type {
  RepositoryScanJobName,
  RepositoryScanJobPayload,
  RepositoryScanJobResult,
} from '../../scanner/interfaces/repository-scan-job.interface';
import type { Job, Queue } from 'bullmq';

@Injectable()
export class RepositoryScanProducer {
  private readonly queue: Queue<
    RepositoryScanJobPayload,
    RepositoryScanJobResult,
    RepositoryScanJobName
  >;

  constructor(queueRegistryService: QueueRegistryService) {
    this.queue = queueRegistryService.getQueue<
      RepositoryScanJobPayload,
      RepositoryScanJobResult,
      RepositoryScanJobName
    >(QUEUE_NAMES.repositoryScan);
  }

  async addRepositoryScan(
    payload: RepositoryScanJobPayload,
  ): Promise<Job<RepositoryScanJobPayload, RepositoryScanJobResult, RepositoryScanJobName>> {
    return this.queue.add(REPOSITORY_SCAN_JOB_NAME, payload, {
      jobId: payload.scanId,
    });
  }

  async removeRepositoryScan(scanId: string): Promise<boolean> {
    const job = await this.queue.getJob(scanId);

    if (!job) {
      return false;
    }

    await job.remove();
    return true;
  }
}
