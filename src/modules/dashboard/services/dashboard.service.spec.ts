import {
  ApiChangeSeverity,
  ApiChangeType,
  ApiFramework,
  ApiHttpMethod,
  RepositoryProvider,
  ScanStatus,
} from '@prisma/client';

import { DashboardService } from './dashboard.service';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { DashboardRepository } from '../repositories/dashboard.repository';

const user: AuthenticatedUser = {
  avatar: null,
  email: 'engineer@example.com',
  id: 'user-id',
  name: 'Engineer',
  permissions: [],
  roles: ['USER'],
  status: 'ACTIVE',
};

interface DashboardServiceTestContext {
  repository: jest.Mocked<
    Pick<
      DashboardRepository,
      | 'countApiChanges'
      | 'countApiChangesBySeverity'
      | 'countApiChangesByType'
      | 'countApisByFramework'
      | 'countDetectedApis'
      | 'countRepositories'
      | 'countRepositoriesByProvider'
      | 'countScansByStatus'
      | 'listRecentApiChanges'
      | 'listRecentRepositories'
      | 'listRecentScans'
    >
  >;
  service: DashboardService;
}

function createContext(): DashboardServiceTestContext {
  const repository: DashboardServiceTestContext['repository'] = {
    countApiChanges: jest.fn(),
    countApiChangesBySeverity: jest.fn(),
    countApiChangesByType: jest.fn(),
    countApisByFramework: jest.fn(),
    countDetectedApis: jest.fn(),
    countRepositories: jest.fn(),
    countRepositoriesByProvider: jest.fn(),
    countScansByStatus: jest.fn(),
    listRecentApiChanges: jest.fn(),
    listRecentRepositories: jest.fn(),
    listRecentScans: jest.fn(),
  };

  return {
    repository,
    service: new DashboardService(repository as unknown as DashboardRepository),
  };
}

describe(DashboardService.name, () => {
  it('builds user-scoped dashboard metrics from persisted records', async () => {
    const context = createContext();

    jest.mocked(context.repository.countRepositories).mockResolvedValue(3);
    jest.mocked(context.repository.countRepositoriesByProvider).mockResolvedValue([
      {
        count: 2,
        provider: RepositoryProvider.GITHUB,
      },
      {
        count: 1,
        provider: RepositoryProvider.ZIP,
      },
    ]);
    jest.mocked(context.repository.countScansByStatus).mockResolvedValue([
      {
        count: 1,
        status: ScanStatus.RUNNING,
      },
      {
        count: 2,
        status: ScanStatus.COMPLETED,
      },
      {
        count: 1,
        status: ScanStatus.FAILED,
      },
    ]);
    jest.mocked(context.repository.countDetectedApis).mockResolvedValue(125);
    jest.mocked(context.repository.countApisByFramework).mockResolvedValue([
      {
        count: 80,
        framework: ApiFramework.NESTJS,
      },
      {
        count: 45,
        framework: ApiFramework.EXPRESS,
      },
    ]);
    jest.mocked(context.repository.countApiChanges).mockResolvedValue(8);
    jest.mocked(context.repository.countApiChangesBySeverity).mockResolvedValue([
      {
        count: 2,
        severity: ApiChangeSeverity.HIGH,
      },
      {
        count: 6,
        severity: ApiChangeSeverity.LOW,
      },
    ]);
    jest.mocked(context.repository.countApiChangesByType).mockResolvedValue([
      {
        changeType: ApiChangeType.REMOVED,
        count: 2,
      },
      {
        changeType: ApiChangeType.ADDED,
        count: 6,
      },
    ]);
    jest.mocked(context.repository.listRecentRepositories).mockResolvedValue([
      {
        createdAt: new Date('2026-06-08T00:00:00.000Z'),
        fullName: 'owner/api',
        id: 'repository-id',
        provider: RepositoryProvider.GITHUB,
      },
    ]);
    jest.mocked(context.repository.listRecentScans).mockResolvedValue([
      {
        createdAt: new Date('2026-06-08T01:00:00.000Z'),
        errorMessage: null,
        id: 'scan-id',
        progress: 100,
        repository: {
          fullName: 'owner/api',
          id: 'repository-id',
        },
        repositoryId: 'repository-id',
        status: ScanStatus.COMPLETED,
      },
    ]);
    jest.mocked(context.repository.listRecentApiChanges).mockResolvedValue([
      {
        api: {
          method: ApiHttpMethod.GET,
          path: '/users',
        },
        apiId: 'api-id',
        changeType: ApiChangeType.REMOVED,
        createdAt: new Date('2026-06-08T02:00:00.000Z'),
        description: 'Endpoint was removed.',
        id: 'change-id',
        repository: {
          fullName: 'owner/api',
          id: 'repository-id',
        },
        repositoryId: 'repository-id',
        severity: ApiChangeSeverity.HIGH,
      },
    ]);

    const overview = await context.service.getOverview(user);

    expect(context.repository.countRepositories).toHaveBeenCalledWith(user.id);
    expect(overview.repositoryOverview.totalRepositories).toBe(3);
    expect(overview.scanSummary.totalScans).toBe(4);
    expect(overview.scanSummary.activeScans).toBe(1);
    expect(overview.apiIntelligence.totalApis).toBe(125);
    expect(overview.riskOverview.breakingChanges).toBe(2);
    expect(overview.recentActivity[0]).toEqual(
      expect.objectContaining({
        apiId: 'api-id',
        severity: ApiChangeSeverity.HIGH,
        type: 'API_CHANGE',
      }),
    );
  });
});
