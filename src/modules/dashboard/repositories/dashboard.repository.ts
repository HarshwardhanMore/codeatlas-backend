import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import type {
  ApiChange,
  ApiChangeSeverity,
  ApiChangeType,
  ApiFramework,
  DetectedApi,
  Repository,
  RepositoryProvider,
  ScanJob,
  ScanStatus,
} from '@prisma/client';

export interface CountByApiChangeSeverity {
  count: number;
  severity: ApiChangeSeverity;
}

export interface CountByApiChangeType {
  changeType: ApiChangeType;
  count: number;
}

export interface CountByApiFramework {
  count: number;
  framework: ApiFramework;
}

export interface CountByRepositoryProvider {
  count: number;
  provider: RepositoryProvider;
}

export interface CountByScanStatus {
  count: number;
  status: ScanStatus;
}

export type RecentRepositoryRecord = Pick<Repository, 'createdAt' | 'fullName' | 'id' | 'provider'>;

export type RecentScanRecord = Pick<
  ScanJob,
  'createdAt' | 'errorMessage' | 'id' | 'progress' | 'repositoryId' | 'status'
> & {
  repository: Pick<Repository, 'fullName' | 'id'>;
};

export type RecentApiChangeRecord = Pick<
  ApiChange,
  'apiId' | 'changeType' | 'createdAt' | 'description' | 'id' | 'repositoryId' | 'severity'
> & {
  api: Pick<DetectedApi, 'method' | 'path'>;
  repository: Pick<Repository, 'fullName' | 'id'>;
};

const RECENT_ACTIVITY_SOURCE_LIMIT = 5;

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countRepositories(ownerId: string): Promise<number> {
    return this.prisma.repository.count({
      where: {
        ownerId,
      },
    });
  }

  countDetectedApis(ownerId: string): Promise<number> {
    return this.prisma.detectedApi.count({
      where: {
        repository: {
          ownerId,
        },
      },
    });
  }

  countApiChanges(ownerId: string): Promise<number> {
    return this.prisma.apiChange.count({
      where: {
        repository: {
          ownerId,
        },
      },
    });
  }

  async countRepositoriesByProvider(ownerId: string): Promise<CountByRepositoryProvider[]> {
    const rows = await this.prisma.repository.groupBy({
      _count: {
        _all: true,
      },
      by: ['provider'],
      where: {
        ownerId,
      },
    });

    return rows.map((row) => ({
      count: row._count._all,
      provider: row.provider,
    }));
  }

  async countScansByStatus(ownerId: string): Promise<CountByScanStatus[]> {
    const rows = await this.prisma.scanJob.groupBy({
      _count: {
        _all: true,
      },
      by: ['status'],
      where: {
        repository: {
          ownerId,
        },
      },
    });

    return rows.map((row) => ({
      count: row._count._all,
      status: row.status,
    }));
  }

  async countApisByFramework(ownerId: string): Promise<CountByApiFramework[]> {
    const rows = await this.prisma.detectedApi.groupBy({
      _count: {
        _all: true,
      },
      by: ['framework'],
      where: {
        repository: {
          ownerId,
        },
      },
    });

    return rows.map((row) => ({
      count: row._count._all,
      framework: row.framework,
    }));
  }

  async countApiChangesBySeverity(ownerId: string): Promise<CountByApiChangeSeverity[]> {
    const rows = await this.prisma.apiChange.groupBy({
      _count: {
        _all: true,
      },
      by: ['severity'],
      where: {
        repository: {
          ownerId,
        },
      },
    });

    return rows.map((row) => ({
      count: row._count._all,
      severity: row.severity,
    }));
  }

  async countApiChangesByType(ownerId: string): Promise<CountByApiChangeType[]> {
    const rows = await this.prisma.apiChange.groupBy({
      _count: {
        _all: true,
      },
      by: ['changeType'],
      where: {
        repository: {
          ownerId,
        },
      },
    });

    return rows.map((row) => ({
      changeType: row.changeType,
      count: row._count._all,
    }));
  }

  listRecentRepositories(ownerId: string): Promise<RecentRepositoryRecord[]> {
    return this.prisma.repository.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
        fullName: true,
        id: true,
        provider: true,
      },
      take: RECENT_ACTIVITY_SOURCE_LIMIT,
      where: {
        ownerId,
      },
    });
  }

  listRecentScans(ownerId: string): Promise<RecentScanRecord[]> {
    return this.prisma.scanJob.findMany({
      include: {
        repository: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: RECENT_ACTIVITY_SOURCE_LIMIT,
      where: {
        repository: {
          ownerId,
        },
      },
    });
  }

  listRecentApiChanges(ownerId: string): Promise<RecentApiChangeRecord[]> {
    return this.prisma.apiChange.findMany({
      include: {
        api: {
          select: {
            method: true,
            path: true,
          },
        },
        repository: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: RECENT_ACTIVITY_SOURCE_LIMIT,
      where: {
        repository: {
          ownerId,
        },
      },
    });
  }
}
