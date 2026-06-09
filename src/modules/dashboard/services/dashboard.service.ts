import { Injectable } from '@nestjs/common';
import {
  ApiChangeSeverity,
  ApiChangeType,
  ApiFramework,
  RepositoryProvider,
  ScanStatus,
} from '@prisma/client';

import { DashboardRepository } from '../repositories/dashboard.repository';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type {
  CountByApiChangeSeverity,
  CountByApiChangeType,
  CountByApiFramework,
  CountByRepositoryProvider,
  CountByScanStatus,
  RecentApiChangeRecord,
  RecentRepositoryRecord,
  RecentScanRecord,
} from '../repositories/dashboard.repository';

export type DashboardActivityType = 'API_CHANGE' | 'REPOSITORY_ADDED' | 'SCAN_UPDATED';

export interface DashboardBreakdownItem<TKey extends string> {
  count: number;
  key: TKey;
}

export interface DashboardActivityResponse {
  apiId: string | null;
  description: string;
  occurredAt: string;
  repositoryFullName: string | null;
  repositoryId: string | null;
  scanId: string | null;
  severity: ApiChangeSeverity | null;
  status: ScanStatus | null;
  title: string;
  type: DashboardActivityType;
}

export interface DashboardOverviewResponse {
  apiIntelligence: {
    frameworks: DashboardBreakdownItem<ApiFramework>[];
    totalApis: number;
  };
  generatedAt: string;
  recentActivity: DashboardActivityResponse[];
  repositoryOverview: {
    providers: DashboardBreakdownItem<RepositoryProvider>[];
    totalRepositories: number;
  };
  riskOverview: {
    breakingChanges: number;
    severities: DashboardBreakdownItem<ApiChangeSeverity>[];
    totalChanges: number;
    types: DashboardBreakdownItem<ApiChangeType>[];
  };
  scanSummary: {
    activeScans: number;
    completedScans: number;
    failedScans: number;
    statuses: DashboardBreakdownItem<ScanStatus>[];
    totalScans: number;
  };
}

const ACTIVITY_LIMIT = 10;
const API_FRAMEWORKS = [ApiFramework.NESTJS, ApiFramework.EXPRESS] as const;
const API_CHANGE_SEVERITIES = [
  ApiChangeSeverity.INFO,
  ApiChangeSeverity.LOW,
  ApiChangeSeverity.MEDIUM,
  ApiChangeSeverity.HIGH,
] as const;
const API_CHANGE_TYPES = [
  ApiChangeType.ADDED,
  ApiChangeType.REMOVED,
  ApiChangeType.MODIFIED,
  ApiChangeType.DEPRECATED,
] as const;
const REPOSITORY_PROVIDERS = [
  RepositoryProvider.GITHUB,
  RepositoryProvider.BITBUCKET,
  RepositoryProvider.ZIP,
] as const;
const SCAN_STATUSES = [
  ScanStatus.QUEUED,
  ScanStatus.RUNNING,
  ScanStatus.COMPLETED,
  ScanStatus.FAILED,
  ScanStatus.CANCELLED,
] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async getOverview(user: AuthenticatedUser): Promise<DashboardOverviewResponse> {
    const [
      totalRepositories,
      repositoryProviderCounts,
      scanStatusCounts,
      totalApis,
      apiFrameworkCounts,
      totalChanges,
      apiChangeSeverityCounts,
      apiChangeTypeCounts,
      recentRepositories,
      recentScans,
      recentApiChanges,
    ] = await Promise.all([
      this.dashboardRepository.countRepositories(user.id),
      this.dashboardRepository.countRepositoriesByProvider(user.id),
      this.dashboardRepository.countScansByStatus(user.id),
      this.dashboardRepository.countDetectedApis(user.id),
      this.dashboardRepository.countApisByFramework(user.id),
      this.dashboardRepository.countApiChanges(user.id),
      this.dashboardRepository.countApiChangesBySeverity(user.id),
      this.dashboardRepository.countApiChangesByType(user.id),
      this.dashboardRepository.listRecentRepositories(user.id),
      this.dashboardRepository.listRecentScans(user.id),
      this.dashboardRepository.listRecentApiChanges(user.id),
    ]);
    const statuses = this.mapScanStatusCounts(scanStatusCounts);
    const severities = this.mapApiChangeSeverityCounts(apiChangeSeverityCounts);

    return {
      apiIntelligence: {
        frameworks: this.mapApiFrameworkCounts(apiFrameworkCounts),
        totalApis,
      },
      generatedAt: new Date().toISOString(),
      recentActivity: this.buildRecentActivity(recentRepositories, recentScans, recentApiChanges),
      repositoryOverview: {
        providers: this.mapRepositoryProviderCounts(repositoryProviderCounts),
        totalRepositories,
      },
      riskOverview: {
        breakingChanges: this.getBreakdownCount(severities, ApiChangeSeverity.HIGH),
        severities,
        totalChanges,
        types: this.mapApiChangeTypeCounts(apiChangeTypeCounts),
      },
      scanSummary: {
        activeScans:
          this.getBreakdownCount(statuses, ScanStatus.QUEUED) +
          this.getBreakdownCount(statuses, ScanStatus.RUNNING),
        completedScans: this.getBreakdownCount(statuses, ScanStatus.COMPLETED),
        failedScans: this.getBreakdownCount(statuses, ScanStatus.FAILED),
        statuses,
        totalScans: statuses.reduce((total, item) => total + item.count, 0),
      },
    };
  }

  private buildRecentActivity(
    repositories: RecentRepositoryRecord[],
    scans: RecentScanRecord[],
    apiChanges: RecentApiChangeRecord[],
  ): DashboardActivityResponse[] {
    const activity = [
      ...repositories.map((repository) => this.toRepositoryActivity(repository)),
      ...scans.map((scan) => this.toScanActivity(scan)),
      ...apiChanges.map((change) => this.toApiChangeActivity(change)),
    ];

    return activity
      .sort((first, second) => Date.parse(second.occurredAt) - Date.parse(first.occurredAt))
      .slice(0, ACTIVITY_LIMIT);
  }

  private getBreakdownCount<TKey extends string>(
    items: DashboardBreakdownItem<TKey>[],
    key: TKey,
  ): number {
    return items.find((item) => item.key === key)?.count ?? 0;
  }

  private mapApiChangeSeverityCounts(
    rows: CountByApiChangeSeverity[],
  ): DashboardBreakdownItem<ApiChangeSeverity>[] {
    const counts = new Map(rows.map((row) => [row.severity, row.count]));

    return API_CHANGE_SEVERITIES.map((severity) => ({
      count: counts.get(severity) ?? 0,
      key: severity,
    }));
  }

  private mapApiChangeTypeCounts(
    rows: CountByApiChangeType[],
  ): DashboardBreakdownItem<ApiChangeType>[] {
    const counts = new Map(rows.map((row) => [row.changeType, row.count]));

    return API_CHANGE_TYPES.map((changeType) => ({
      count: counts.get(changeType) ?? 0,
      key: changeType,
    }));
  }

  private mapApiFrameworkCounts(
    rows: CountByApiFramework[],
  ): DashboardBreakdownItem<ApiFramework>[] {
    const counts = new Map(rows.map((row) => [row.framework, row.count]));

    return API_FRAMEWORKS.map((framework) => ({
      count: counts.get(framework) ?? 0,
      key: framework,
    }));
  }

  private mapRepositoryProviderCounts(
    rows: CountByRepositoryProvider[],
  ): DashboardBreakdownItem<RepositoryProvider>[] {
    const counts = new Map(rows.map((row) => [row.provider, row.count]));

    return REPOSITORY_PROVIDERS.map((provider) => ({
      count: counts.get(provider) ?? 0,
      key: provider,
    }));
  }

  private mapScanStatusCounts(rows: CountByScanStatus[]): DashboardBreakdownItem<ScanStatus>[] {
    const counts = new Map(rows.map((row) => [row.status, row.count]));

    return SCAN_STATUSES.map((status) => ({
      count: counts.get(status) ?? 0,
      key: status,
    }));
  }

  private toApiChangeActivity(change: RecentApiChangeRecord): DashboardActivityResponse {
    return {
      apiId: change.apiId,
      description: `${change.changeType} ${change.api.method} ${change.api.path}: ${change.description}`,
      occurredAt: change.createdAt.toISOString(),
      repositoryFullName: change.repository.fullName,
      repositoryId: change.repositoryId,
      scanId: null,
      severity: change.severity,
      status: null,
      title: 'API change detected',
      type: 'API_CHANGE',
    };
  }

  private toRepositoryActivity(repository: RecentRepositoryRecord): DashboardActivityResponse {
    return {
      apiId: null,
      description: `${repository.fullName} was added from ${repository.provider}.`,
      occurredAt: repository.createdAt.toISOString(),
      repositoryFullName: repository.fullName,
      repositoryId: repository.id,
      scanId: null,
      severity: null,
      status: null,
      title: 'Repository added',
      type: 'REPOSITORY_ADDED',
    };
  }

  private toScanActivity(scan: RecentScanRecord): DashboardActivityResponse {
    const failureDetail = scan.errorMessage ? ` ${scan.errorMessage}` : '';

    return {
      apiId: null,
      description: `${scan.repository.fullName} scan is ${scan.status} at ${scan.progress.toString()}%.${failureDetail}`,
      occurredAt: scan.createdAt.toISOString(),
      repositoryFullName: scan.repository.fullName,
      repositoryId: scan.repositoryId,
      scanId: scan.id,
      severity: null,
      status: scan.status,
      title: 'Scan updated',
      type: 'SCAN_UPDATED',
    };
  }
}
