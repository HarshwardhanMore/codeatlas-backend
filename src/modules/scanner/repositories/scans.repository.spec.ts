import { Prisma, ScanStatus } from '@prisma/client';

import { ScansRepository } from './scans.repository';

import type { PrismaService } from '../../prisma/prisma.service';
import type { ScanJob } from '@prisma/client';

const timestamp = new Date('2026-06-08T00:00:00.000Z');

const activeScan: ScanJob = {
  createdAt: timestamp,
  errorMessage: null,
  finishedAt: null,
  id: 'active-scan-id',
  metadata: null,
  progress: 0,
  repositoryId: 'repository-id',
  startedAt: null,
  status: ScanStatus.QUEUED,
  updatedAt: timestamp,
};

function createPrismaService(): jest.Mocked<Pick<PrismaService, 'scanJob'>> & {
  scanJob: {
    create: jest.Mock;
    findFirst: jest.Mock;
  };
} {
  return {
    scanJob: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  } as unknown as jest.Mocked<Pick<PrismaService, 'scanJob'>> & {
    scanJob: {
      create: jest.Mock;
      findFirst: jest.Mock;
    };
  };
}

describe(ScansRepository.name, () => {
  it('returns the concurrent active scan when the database active-scan guard rejects insert', async () => {
    const prisma = createPrismaService();
    const repository = new ScansRepository(prisma as unknown as PrismaService);
    const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      clientVersion: 'test',
      code: 'P2002',
    });

    prisma.scanJob.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(activeScan);
    prisma.scanJob.create.mockRejectedValue(uniqueError);

    const result = await repository.createQueuedScanOrGetActive({
      metadata: {
        queueName: 'repository.scan',
      },
      repositoryId: activeScan.repositoryId,
    });

    expect(result).toEqual({
      created: false,
      scan: activeScan,
    });
    expect(prisma.scanJob.create).toHaveBeenCalledTimes(1);
    expect(prisma.scanJob.findFirst).toHaveBeenCalledTimes(2);
  });
});
