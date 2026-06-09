import { RepositoryScanProducer } from './repository-scan.producer';
import { REPOSITORY_SCAN_JOB_NAME } from '../queues/queue.constants';

import type { RepositoryScanJobPayload } from '../../scanner/interfaces/repository-scan-job.interface';
import type { QueueRegistryService } from '../queues/queue-registry.service';
import type { Job, Queue } from 'bullmq';

describe(RepositoryScanProducer.name, () => {
  it('adds repository scan jobs with scan id as the BullMQ job id', async () => {
    const payload: RepositoryScanJobPayload = {
      repositoryId: 'repository-id',
      scanId: 'scan-id',
      userId: 'user-id',
    };
    const job = { id: payload.scanId } as Job;
    const addJob = jest.fn<Promise<Job>, [string, RepositoryScanJobPayload, { jobId: string }]>(
      () => Promise.resolve(job),
    );
    const queue = {
      add: addJob,
    } as unknown as Queue;
    const queueRegistryService = {
      getQueue: jest.fn(() => queue),
    } as unknown as QueueRegistryService;
    const producer = new RepositoryScanProducer(queueRegistryService);

    await expect(producer.addRepositoryScan(payload)).resolves.toBe(job);

    expect(addJob).toHaveBeenCalledWith(REPOSITORY_SCAN_JOB_NAME, payload, {
      jobId: payload.scanId,
    });
  });
});
