import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ScanStatus, type Prisma, type ScanJob } from '@prisma/client';

import { ScanProgressConsumer } from '../../jobs/consumers/scan-progress.consumer';
import { RepositoryScanProducer } from '../../jobs/producers/repository-scan.producer';
import { QUEUE_NAMES } from '../../jobs/queues/queue.constants';
import { DEFAULT_SCAN_LIST_LIMIT } from '../dto/list-scans-query.dto';
import { ScansRepository } from '../repositories/scans.repository';
import { TERMINAL_SCAN_STATUSES } from '../scanner.constants';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { ListScansQueryDto } from '../dto/list-scans-query.dto';
import type { ScanProgressSnapshot } from '../interfaces/repository-scan-job.interface';
import type { ScanListOptions } from '../repositories/scans.repository';

export interface ScanResponse {
  id: string;
  repositoryId: string;
  status: ScanStatus;
  progress: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScanMutationResponse {
  scan: ScanResponse;
}

export interface ScanStatusResponse {
  scan: ScanResponse;
  progress: ScanProgressSnapshot;
}

export interface PaginationResponse {
  hasNext: boolean;
  hasPrevious: boolean;
  limit: number;
  offset: number;
  total: number;
}

export interface PaginatedScanResponse {
  items: ScanResponse[];
  pagination: PaginationResponse;
}

@Injectable()
export class ScannerService {
  constructor(
    private readonly progressConsumer: ScanProgressConsumer,
    private readonly repositoryScanProducer: RepositoryScanProducer,
    private readonly scansRepository: ScansRepository,
  ) {}

  async startRepositoryScan(
    user: AuthenticatedUser,
    repositoryId: string,
  ): Promise<ScanMutationResponse> {
    await this.assertRepositoryOwnership(repositoryId, user.id);

    const scanResult = await this.scansRepository.createQueuedScanOrGetActive({
      metadata: {
        queueName: QUEUE_NAMES.repositoryScan,
      },
      repositoryId,
    });
    const scan = scanResult.scan;

    if (!scanResult.created) {
      return {
        scan: this.toScanResponse(scan),
      };
    }
    await this.progressConsumer.setProgress(scan.id, {
      message: 'Repository scan is queued.',
      progress: 0,
      stage: 'Queued',
      updatedAt: new Date().toISOString(),
    });

    try {
      const job = await this.repositoryScanProducer.addRepositoryScan({
        repositoryId,
        scanId: scan.id,
        userId: user.id,
      });

      const queuedScan = await this.scansRepository.updateQueuedMetadata(scan.id, {
        bullMqJobId: job.id ?? scan.id,
        queueName: QUEUE_NAMES.repositoryScan,
      });

      return {
        scan: this.toScanResponse(queuedScan),
      };
    } catch {
      await this.scansRepository.markFailed(scan.id, 'Repository scan could not be queued.');
      throw new ServiceUnavailableException('Repository scan could not be queued.');
    }
  }

  async listRepositoryScans(
    user: AuthenticatedUser,
    repositoryId: string,
    query: ListScansQueryDto = {},
  ): Promise<ScanResponse[] | PaginatedScanResponse> {
    await this.assertRepositoryOwnership(repositoryId, user.id);
    const pagination = this.toScanListOptions(query);

    if (!pagination) {
      const scans = await this.scansRepository.listScansForRepository(repositoryId);

      return scans.map((scan) => this.toScanResponse(scan));
    }

    const [scans, total] = await Promise.all([
      this.scansRepository.listScansForRepository(repositoryId, pagination),
      this.scansRepository.countScansForRepository(repositoryId),
    ]);

    return {
      items: scans.map((scan) => this.toScanResponse(scan)),
      pagination: this.toPaginationResponse(total, pagination),
    };
  }

  async getScan(user: AuthenticatedUser, scanId: string): Promise<ScanMutationResponse> {
    const scan = await this.findScanForUser(user.id, scanId);

    return {
      scan: this.toScanResponse(scan),
    };
  }

  async getScanStatus(user: AuthenticatedUser, scanId: string): Promise<ScanStatusResponse> {
    const scan = await this.findScanForUser(user.id, scanId);
    const progress = await this.progressConsumer.getProgress(scan.id);

    return {
      progress:
        progress ??
        ({
          message: scan.status,
          progress: scan.progress,
          stage: scan.status,
          updatedAt: scan.updatedAt.toISOString(),
        } satisfies ScanProgressSnapshot),
      scan: this.toScanResponse(scan),
    };
  }

  async cancelScan(user: AuthenticatedUser, scanId: string): Promise<ScanMutationResponse> {
    const scan = await this.findScanForUser(user.id, scanId);

    if (this.isTerminalStatus(scan.status)) {
      return {
        scan: this.toScanResponse(scan),
      };
    }

    await this.repositoryScanProducer.removeRepositoryScan(scan.id).catch(() => false);
    const cancelledScan = await this.scansRepository.markCancelled(scan.id);
    await this.progressConsumer.setProgress(scan.id, {
      message: 'Repository scan was cancelled.',
      progress: cancelledScan.progress,
      stage: ScanStatus.CANCELLED,
      updatedAt: new Date().toISOString(),
    });

    return {
      scan: this.toScanResponse(cancelledScan),
    };
  }

  private async assertRepositoryOwnership(repositoryId: string, userId: string): Promise<void> {
    const repository = await this.scansRepository.findRepositoryForUser(repositoryId, userId);

    if (!repository) {
      throw new NotFoundException('Repository was not found.');
    }
  }

  private async findScanForUser(userId: string, scanId: string): Promise<ScanJob> {
    const scan = await this.scansRepository.findScanForUser(scanId, userId);

    if (!scan) {
      throw new NotFoundException('Scan was not found.');
    }

    return scan;
  }

  private isTerminalStatus(status: ScanStatus): boolean {
    return TERMINAL_SCAN_STATUSES.includes(status);
  }

  private toScanResponse(scan: ScanJob): ScanResponse {
    return {
      createdAt: scan.createdAt.toISOString(),
      errorMessage: scan.errorMessage,
      finishedAt: scan.finishedAt ? scan.finishedAt.toISOString() : null,
      id: scan.id,
      metadata: scan.metadata,
      progress: scan.progress,
      repositoryId: scan.repositoryId,
      startedAt: scan.startedAt ? scan.startedAt.toISOString() : null,
      status: scan.status,
      updatedAt: scan.updatedAt.toISOString(),
    };
  }

  private toScanListOptions(query: ListScansQueryDto): ScanListOptions | null {
    if (query.limit === undefined && query.offset === undefined) {
      return null;
    }

    return {
      limit: query.limit ?? DEFAULT_SCAN_LIST_LIMIT,
      offset: query.offset ?? 0,
    };
  }

  private toPaginationResponse(total: number, options: ScanListOptions): PaginationResponse {
    return {
      hasNext: options.offset + options.limit < total,
      hasPrevious: options.offset > 0,
      limit: options.limit,
      offset: options.offset,
      total,
    };
  }
}
