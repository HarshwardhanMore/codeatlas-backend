import { Injectable } from '@nestjs/common';
import { Prisma, ScanStatus, type Repository, type ScanJob } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_SCAN_STATUSES } from '../scanner.constants';

export interface CreateScanInput {
  repositoryId: string;
  metadata: Prisma.InputJsonValue;
}

export interface UpdateProgressInput {
  metadata?: Prisma.InputJsonValue;
  progress: number;
}

export interface CreateQueuedScanResult {
  created: boolean;
  scan: ScanJob;
}

export interface ScanListOptions {
  limit: number;
  offset: number;
}

@Injectable()
export class ScansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRepositoryForUser(repositoryId: string, userId: string): Promise<Repository | null> {
    return this.prisma.repository.findFirst({
      where: {
        id: repositoryId,
        ownerId: userId,
      },
    });
  }

  async createScan(input: CreateScanInput): Promise<ScanJob> {
    return this.prisma.scanJob.create({
      data: {
        metadata: input.metadata,
        progress: 0,
        repositoryId: input.repositoryId,
        status: ScanStatus.QUEUED,
      },
    });
  }

  async createQueuedScanOrGetActive(input: CreateScanInput): Promise<CreateQueuedScanResult> {
    const activeScan = await this.findActiveScanForRepository(input.repositoryId);

    if (activeScan) {
      return {
        created: false,
        scan: activeScan,
      };
    }

    try {
      return {
        created: true,
        scan: await this.createScan(input),
      };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const concurrentActiveScan = await this.findActiveScanForRepository(input.repositoryId);

      if (!concurrentActiveScan) {
        throw error;
      }

      return {
        created: false,
        scan: concurrentActiveScan,
      };
    }
  }

  async findActiveScanForRepository(repositoryId: string): Promise<ScanJob | null> {
    return this.prisma.scanJob.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        repositoryId,
        status: {
          in: [...ACTIVE_SCAN_STATUSES],
        },
      },
    });
  }

  async updateQueuedMetadata(scanId: string, metadata: Prisma.InputJsonValue): Promise<ScanJob> {
    return this.prisma.scanJob.update({
      data: {
        metadata,
      },
      where: {
        id: scanId,
      },
    });
  }

  async listScansForRepository(
    repositoryId: string,
    options?: ScanListOptions,
  ): Promise<ScanJob[]> {
    return this.prisma.scanJob.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      skip: options?.offset,
      take: options?.limit,
      where: {
        repositoryId,
      },
    });
  }

  countScansForRepository(repositoryId: string): Promise<number> {
    return this.prisma.scanJob.count({
      where: {
        repositoryId,
      },
    });
  }

  async findScanForUser(scanId: string, userId: string): Promise<ScanJob | null> {
    return this.prisma.scanJob.findFirst({
      where: {
        id: scanId,
        repository: {
          ownerId: userId,
        },
      },
    });
  }

  async findScanById(scanId: string): Promise<ScanJob | null> {
    return this.prisma.scanJob.findUnique({
      where: {
        id: scanId,
      },
    });
  }

  async markRunning(scanId: string): Promise<ScanJob> {
    return this.prisma.scanJob.update({
      data: {
        errorMessage: null,
        startedAt: new Date(),
        status: ScanStatus.RUNNING,
      },
      where: {
        id: scanId,
      },
    });
  }

  async updateProgress(scanId: string, input: UpdateProgressInput): Promise<ScanJob> {
    return this.prisma.scanJob.update({
      data: {
        metadata: input.metadata,
        progress: input.progress,
      },
      where: {
        id: scanId,
      },
    });
  }

  async markCompleted(scanId: string, metadata: Prisma.InputJsonValue): Promise<ScanJob> {
    return this.prisma.scanJob.update({
      data: {
        errorMessage: null,
        finishedAt: new Date(),
        metadata,
        progress: 100,
        status: ScanStatus.COMPLETED,
      },
      where: {
        id: scanId,
      },
    });
  }

  async markCompletedIfRunning(scanId: string, metadata: Prisma.InputJsonValue): Promise<ScanJob> {
    await this.prisma.scanJob.updateMany({
      data: {
        errorMessage: null,
        finishedAt: new Date(),
        metadata,
        progress: 100,
        status: ScanStatus.COMPLETED,
      },
      where: {
        id: scanId,
        status: ScanStatus.RUNNING,
      },
    });

    return this.prisma.scanJob.findUniqueOrThrow({
      where: {
        id: scanId,
      },
    });
  }

  async markFailed(scanId: string, errorMessage: string): Promise<ScanJob> {
    return this.prisma.scanJob.update({
      data: {
        errorMessage,
        finishedAt: new Date(),
        status: ScanStatus.FAILED,
      },
      where: {
        id: scanId,
      },
    });
  }

  async markCancelled(scanId: string): Promise<ScanJob> {
    return this.prisma.scanJob.update({
      data: {
        errorMessage: null,
        finishedAt: new Date(),
        status: ScanStatus.CANCELLED,
      },
      where: {
        id: scanId,
      },
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
