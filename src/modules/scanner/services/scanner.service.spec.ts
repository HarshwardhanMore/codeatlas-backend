import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { RepositoryProvider, ScanStatus, UserStatus } from '@prisma/client';

import { ScannerService } from './scanner.service';
import { QUEUE_NAMES } from '../../jobs/queues/queue.constants';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { ScanProgressConsumer } from '../../jobs/consumers/scan-progress.consumer';
import type { RepositoryScanProducer } from '../../jobs/producers/repository-scan.producer';
import type {
  RepositoryScanJobName,
  RepositoryScanJobPayload,
  RepositoryScanJobResult,
} from '../interfaces/repository-scan-job.interface';
import type { ScansRepository } from '../repositories/scans.repository';
import type { Repository, ScanJob } from '@prisma/client';
import type { Job } from 'bullmq';

const timestamp = new Date('2026-06-08T00:00:00.000Z');

const user: AuthenticatedUser = {
  avatar: null,
  email: 'engineer@example.com',
  id: 'user-id',
  name: 'Engineer',
  permissions: [],
  roles: ['USER'],
  status: UserStatus.ACTIVE,
};

const repository: Repository = {
  archivePath: null,
  connectionId: 'connection-id',
  createdAt: timestamp,
  defaultBranch: 'main',
  externalId: 'external-id',
  fullName: 'owner/api',
  id: 'repository-id',
  language: 'TypeScript',
  name: 'api',
  ownerId: user.id,
  provider: RepositoryProvider.GITHUB,
  sourcePath: null,
  updatedAt: timestamp,
  uploadSizeBytes: null,
  url: 'https://github.com/owner/api',
  visibility: 'private',
};

const scan: ScanJob = {
  createdAt: timestamp,
  errorMessage: null,
  finishedAt: null,
  id: 'scan-id',
  metadata: null,
  progress: 0,
  repositoryId: repository.id,
  startedAt: null,
  status: ScanStatus.QUEUED,
  updatedAt: timestamp,
};

interface ScannerServiceTestContext {
  producer: jest.Mocked<Pick<RepositoryScanProducer, 'addRepositoryScan' | 'removeRepositoryScan'>>;
  progressConsumer: jest.Mocked<Pick<ScanProgressConsumer, 'getProgress' | 'setProgress'>>;
  scansRepository: jest.Mocked<
    Pick<
      ScansRepository,
      | 'countScansForRepository'
      | 'createQueuedScanOrGetActive'
      | 'findRepositoryForUser'
      | 'findScanForUser'
      | 'listScansForRepository'
      | 'markCancelled'
      | 'markFailed'
      | 'updateQueuedMetadata'
    >
  >;
  service: ScannerService;
}

function createContext(): ScannerServiceTestContext {
  const producer: ScannerServiceTestContext['producer'] = {
    addRepositoryScan: jest.fn(),
    removeRepositoryScan: jest.fn(),
  };
  const progressConsumer: ScannerServiceTestContext['progressConsumer'] = {
    getProgress: jest.fn(),
    setProgress: jest.fn(),
  };
  const scansRepository: ScannerServiceTestContext['scansRepository'] = {
    countScansForRepository: jest.fn(),
    createQueuedScanOrGetActive: jest.fn(),
    findRepositoryForUser: jest.fn(),
    findScanForUser: jest.fn(),
    listScansForRepository: jest.fn(),
    markCancelled: jest.fn(),
    markFailed: jest.fn(),
    updateQueuedMetadata: jest.fn(),
  };

  return {
    producer,
    progressConsumer,
    scansRepository,
    service: new ScannerService(
      progressConsumer as unknown as ScanProgressConsumer,
      producer as unknown as RepositoryScanProducer,
      scansRepository as unknown as ScansRepository,
    ),
  };
}

describe(ScannerService.name, () => {
  it('returns paginated scan history when pagination query is provided', async () => {
    const context = createContext();

    jest.mocked(context.scansRepository.findRepositoryForUser).mockResolvedValue(repository);
    jest.mocked(context.scansRepository.listScansForRepository).mockResolvedValue([scan]);
    jest.mocked(context.scansRepository.countScansForRepository).mockResolvedValue(52);

    const response = await context.service.listRepositoryScans(user, repository.id, {
      limit: 25,
      offset: 25,
    });

    expect(context.scansRepository.listScansForRepository).toHaveBeenCalledWith(repository.id, {
      limit: 25,
      offset: 25,
    });
    expect(response).toEqual({
      items: [
        expect.objectContaining({
          id: scan.id,
        }),
      ],
      pagination: {
        hasNext: true,
        hasPrevious: true,
        limit: 25,
        offset: 25,
        total: 52,
      },
    });
  });

  it('rejects scan start when the repository is not owned by the user', async () => {
    const context = createContext();
    jest.mocked(context.scansRepository.findRepositoryForUser).mockResolvedValue(null);

    await expect(context.service.startRepositoryScan(user, repository.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(context.producer.addRepositoryScan).not.toHaveBeenCalled();
  });

  it('creates a scan record and enqueues a BullMQ job', async () => {
    const context = createContext();
    const queuedScan = {
      ...scan,
      metadata: {
        bullMqJobId: scan.id,
        queueName: QUEUE_NAMES.repositoryScan,
      },
    } satisfies ScanJob;
    jest.mocked(context.scansRepository.findRepositoryForUser).mockResolvedValue(repository);
    jest.mocked(context.scansRepository.createQueuedScanOrGetActive).mockResolvedValue({
      created: true,
      scan,
    });
    jest.mocked(context.producer.addRepositoryScan).mockResolvedValue({
      id: scan.id,
    } as Job<RepositoryScanJobPayload, RepositoryScanJobResult, RepositoryScanJobName>);
    jest.mocked(context.scansRepository.updateQueuedMetadata).mockResolvedValue(queuedScan);

    const result = await context.service.startRepositoryScan(user, repository.id);

    expect(result.scan.id).toBe(scan.id);
    expect(result.scan.repositoryId).toBe(repository.id);
    expect(result.scan.status).toBe(ScanStatus.QUEUED);

    expect(context.producer.addRepositoryScan).toHaveBeenCalledWith({
      repositoryId: repository.id,
      scanId: scan.id,
      userId: user.id,
    });
  });

  it('returns an active scan without enqueueing duplicate work', async () => {
    const context = createContext();
    const activeScan = {
      ...scan,
      status: ScanStatus.RUNNING,
    } satisfies ScanJob;

    jest.mocked(context.scansRepository.findRepositoryForUser).mockResolvedValue(repository);
    jest.mocked(context.scansRepository.createQueuedScanOrGetActive).mockResolvedValue({
      created: false,
      scan: activeScan,
    });

    const result = await context.service.startRepositoryScan(user, repository.id);

    expect(result.scan.id).toBe(activeScan.id);
    expect(result.scan.status).toBe(ScanStatus.RUNNING);
    expect(context.producer.addRepositoryScan).not.toHaveBeenCalled();
  });

  it('marks the scan failed when queueing fails', async () => {
    const context = createContext();
    jest.mocked(context.scansRepository.findRepositoryForUser).mockResolvedValue(repository);
    jest.mocked(context.scansRepository.createQueuedScanOrGetActive).mockResolvedValue({
      created: true,
      scan,
    });
    jest.mocked(context.producer.addRepositoryScan).mockRejectedValue(new Error('redis offline'));

    await expect(context.service.startRepositoryScan(user, repository.id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(context.scansRepository.markFailed).toHaveBeenCalledWith(
      scan.id,
      'Repository scan could not be queued.',
    );
  });
});
