import { RepositoryProvider } from '@prisma/client';

import { RepositoriesService } from './repositories.service';

import type { ZipRepositoryStorageService } from './zip-repository-storage.service';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { RepositoryConnectionsRepository } from '../../integrations/repositories/repository-connections.repository';
import type { IntegrationsService } from '../../integrations/services/integrations.service';
import type { RepositoriesRepository } from '../repositories/repositories.repository';
import type { Repository, RepositoryConnection } from '@prisma/client';

const timestamp = new Date('2026-06-08T00:00:00.000Z');

const authenticatedUser: AuthenticatedUser = {
  avatar: null,
  email: 'engineer@example.com',
  id: 'user-id',
  name: 'Engineer',
  permissions: [],
  roles: ['USER'],
  status: 'ACTIVE',
};

const repositoryRecord: Repository = {
  archivePath: null,
  connectionId: 'connection-id',
  createdAt: timestamp,
  defaultBranch: 'main',
  externalId: '123',
  fullName: 'owner/api',
  id: 'repository-id',
  language: 'TypeScript',
  name: 'api',
  ownerId: authenticatedUser.id,
  provider: RepositoryProvider.GITHUB,
  sourcePath: null,
  updatedAt: timestamp,
  uploadSizeBytes: null,
  url: 'https://github.com/owner/api',
  visibility: 'private',
};

const connectionRecord = {
  id: 'connection-id',
  provider: RepositoryProvider.GITHUB,
} as RepositoryConnection;

interface RepositoriesServiceTestContext {
  integrationsService: jest.Mocked<Pick<IntegrationsService, 'getRepositoryMetadataForConnection'>>;
  repositoryConnectionsRepository: jest.Mocked<
    Pick<RepositoryConnectionsRepository, 'upsertZipConnection'>
  >;
  repositoriesRepository: jest.Mocked<
    Pick<
      RepositoriesRepository,
      'countByOwner' | 'createZipRepository' | 'listByOwner' | 'upsertProviderRepository'
    >
  >;
  service: RepositoriesService;
  zipRepositoryStorageService: jest.Mocked<
    Pick<ZipRepositoryStorageService, 'removeStoredRepository' | 'storeZipRepository'>
  >;
}

function createContext(): RepositoriesServiceTestContext {
  const integrationsService: RepositoriesServiceTestContext['integrationsService'] = {
    getRepositoryMetadataForConnection: jest.fn(),
  };
  const repositoryConnectionsRepository: RepositoriesServiceTestContext['repositoryConnectionsRepository'] =
    {
      upsertZipConnection: jest.fn(),
    };
  const repositoriesRepository: RepositoriesServiceTestContext['repositoriesRepository'] = {
    countByOwner: jest.fn(),
    createZipRepository: jest.fn(),
    listByOwner: jest.fn(),
    upsertProviderRepository: jest.fn(),
  };
  const zipRepositoryStorageService: RepositoriesServiceTestContext['zipRepositoryStorageService'] =
    {
      removeStoredRepository: jest.fn(),
      storeZipRepository: jest.fn(),
    };

  return {
    integrationsService,
    repositoryConnectionsRepository,
    repositoriesRepository,
    service: new RepositoriesService(
      integrationsService as unknown as IntegrationsService,
      repositoryConnectionsRepository as unknown as RepositoryConnectionsRepository,
      repositoriesRepository as unknown as RepositoriesRepository,
      zipRepositoryStorageService as unknown as ZipRepositoryStorageService,
    ),
    zipRepositoryStorageService,
  };
}

describe(RepositoriesService.name, () => {
  it('returns paginated repository lists when pagination query is provided', async () => {
    const context = createContext();

    jest.mocked(context.repositoriesRepository.listByOwner).mockResolvedValue([repositoryRecord]);
    jest.mocked(context.repositoriesRepository.countByOwner).mockResolvedValue(101);

    const response = await context.service.listRepositories(authenticatedUser, {
      limit: 25,
      offset: 50,
    });

    expect(context.repositoriesRepository.listByOwner).toHaveBeenCalledWith(authenticatedUser.id, {
      limit: 25,
      offset: 50,
    });
    expect(response).toEqual({
      items: [
        expect.objectContaining({
          id: repositoryRecord.id,
        }),
      ],
      pagination: {
        hasNext: true,
        hasPrevious: true,
        limit: 25,
        offset: 50,
        total: 101,
      },
    });
  });

  it('imports provider repository metadata through the integrations boundary', async () => {
    const context = createContext();
    jest.mocked(context.integrationsService.getRepositoryMetadataForConnection).mockResolvedValue({
      connection: connectionRecord,
      repository: {
        defaultBranch: 'main',
        externalId: repositoryRecord.externalId,
        fullName: repositoryRecord.fullName,
        language: repositoryRecord.language,
        name: repositoryRecord.name,
        url: repositoryRecord.url,
        visibility: repositoryRecord.visibility,
      },
    });
    jest
      .mocked(context.repositoriesRepository.upsertProviderRepository)
      .mockResolvedValue(repositoryRecord);

    await expect(
      context.service.importRepository(authenticatedUser, {
        connectionId: connectionRecord.id,
        externalId: repositoryRecord.externalId,
      }),
    ).resolves.toEqual({
      repository: {
        createdAt: timestamp.toISOString(),
        defaultBranch: repositoryRecord.defaultBranch,
        externalId: repositoryRecord.externalId,
        fullName: repositoryRecord.fullName,
        id: repositoryRecord.id,
        language: repositoryRecord.language,
        name: repositoryRecord.name,
        provider: repositoryRecord.provider,
        updatedAt: timestamp.toISOString(),
        url: repositoryRecord.url,
        visibility: repositoryRecord.visibility,
      },
    });

    expect(context.repositoriesRepository.upsertProviderRepository).toHaveBeenCalledWith({
      connectionId: connectionRecord.id,
      metadata: {
        defaultBranch: 'main',
        externalId: repositoryRecord.externalId,
        fullName: repositoryRecord.fullName,
        language: repositoryRecord.language,
        name: repositoryRecord.name,
        url: repositoryRecord.url,
        visibility: repositoryRecord.visibility,
      },
      ownerId: authenticatedUser.id,
      provider: RepositoryProvider.GITHUB,
    });
  });

  it('cleans uploaded ZIP files when persistence fails', async () => {
    const context = createContext();
    jest
      .mocked(context.repositoryConnectionsRepository.upsertZipConnection)
      .mockResolvedValue({ id: 'zip-connection-id' } as RepositoryConnection);
    jest.mocked(context.zipRepositoryStorageService.storeZipRepository).mockResolvedValue({
      archivePath: '/tmp/archive.zip',
      externalId: 'zip:repository-id',
      fullName: 'uploaded-api',
      name: 'uploaded-api',
      sourcePath: '/tmp/source',
      uploadSizeBytes: 100,
      url: 'zip://repository-id',
    });
    jest
      .mocked(context.repositoriesRepository.createZipRepository)
      .mockRejectedValue(new Error('database unavailable'));

    await expect(context.service.uploadZipRepository(authenticatedUser, undefined)).rejects.toThrow(
      'database unavailable',
    );

    expect(context.zipRepositoryStorageService.removeStoredRepository).toHaveBeenCalledTimes(1);
  });
});
