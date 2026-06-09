import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';

import type { ApiChangeCandidate, ApiContractSnapshot } from '../versioning/api-versioning.types';
import type { ApiSnapshot, DetectedApi } from '@prisma/client';

export type ApiSnapshotWithApi = ApiSnapshot & {
  api: DetectedApi;
};

export interface CreateApiSnapshotInput {
  apiId: string;
  contractHash: string;
  id: string;
  schemaJson: ApiContractSnapshot;
  version: number;
}

export interface ApiVersioningWriteResult {
  changesCreated: number;
  snapshots: ApiSnapshot[];
}

@Injectable()
export class ApiVersioningRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestPreviousSnapshots(
    repositoryId: string,
    scanId: string,
  ): Promise<ApiSnapshotWithApi[]> {
    const currentScan = await this.prisma.scanJob.findUnique({
      select: {
        createdAt: true,
      },
      where: {
        id: scanId,
      },
    });

    if (!currentScan) {
      return [];
    }

    const previousScan = await this.prisma.scanJob.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
      },
      where: {
        createdAt: {
          lt: currentScan.createdAt,
        },
        repositoryId,
        status: 'COMPLETED',
      },
    });

    if (!previousScan) {
      return [];
    }

    return this.prisma.apiSnapshot.findMany({
      include: {
        api: true,
      },
      where: {
        scanId: previousScan.id,
      },
    });
  }

  async createSnapshotsAndChanges(
    repositoryId: string,
    scanId: string,
    snapshots: CreateApiSnapshotInput[],
    changes: ApiChangeCandidate[],
  ): Promise<ApiVersioningWriteResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.apiChange.deleteMany({
        where: {
          scanId,
        },
      });

      if (snapshots.length > 0) {
        await transaction.apiSnapshot.createMany({
          data: snapshots.map((snapshot) => ({
            apiId: snapshot.apiId,
            contractHash: snapshot.contractHash,
            id: snapshot.id,
            repositoryId,
            scanId,
            schemaJson: this.toJson(snapshot.schemaJson),
            version: snapshot.version,
          })),
        });
      }

      const createdSnapshots = await transaction.apiSnapshot.findMany({
        where: {
          scanId,
        },
      });

      if (changes.length > 0) {
        await transaction.apiChange.createMany({
          data: changes.map((change) => ({
            apiId: change.apiId,
            changeType: change.changeType,
            description: change.description,
            metadata: change.metadata,
            newSnapshotId: change.newSnapshotId,
            oldSnapshotId: change.oldSnapshotId,
            repositoryId,
            scanId,
            severity: change.risk.severity,
          })),
        });
      }

      return {
        changesCreated: changes.length,
        snapshots: createdSnapshots,
      };
    });
  }

  private toJson(value: ApiContractSnapshot): Prisma.InputJsonValue {
    return value as unknown as Prisma.InputJsonValue;
  }
}
