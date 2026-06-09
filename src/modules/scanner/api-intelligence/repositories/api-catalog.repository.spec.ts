import { ApiFramework, ApiHttpMethod } from '@prisma/client';

import { ApiCatalogRepository } from './api-catalog.repository';

import type { PrismaService } from '../../../prisma/prisma.service';

interface CountDelegateMock {
  count: jest.Mock;
}

interface DetectedApiDelegateMock extends CountDelegateMock {
  findFirst: jest.Mock;
  findMany: jest.Mock;
}

interface ApiSnapshotDelegateMock {
  findMany: jest.Mock;
}

interface ApiChangeDelegateMock extends CountDelegateMock {
  findMany: jest.Mock;
}

interface PrismaMock {
  apiChange: ApiChangeDelegateMock;
  apiSnapshot: ApiSnapshotDelegateMock;
  detectedApi: DetectedApiDelegateMock;
}

const paginationOptions = {
  limit: 25,
  offset: 0,
};

function createRepository(prisma: PrismaMock): ApiCatalogRepository {
  return new ApiCatalogRepository(prisma as unknown as PrismaService);
}

describe(ApiCatalogRepository.name, () => {
  it('scopes API history by repository, method, and path', async () => {
    const prisma: PrismaMock = {
      apiChange: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      apiSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      detectedApi: {
        count: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          framework: ApiFramework.NESTJS,
          method: ApiHttpMethod.GET,
          path: '/users',
          repositoryId: 'repository-id',
        }),
        findMany: jest.fn(),
      },
    };
    const repository = createRepository(prisma);

    await repository.listApiHistory('api-id', 'user-id');

    expect(prisma.apiSnapshot.findMany).toHaveBeenCalledWith({
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        api: {
          framework: ApiFramework.NESTJS,
          method: ApiHttpMethod.GET,
          path: '/users',
        },
        repositoryId: 'repository-id',
      },
    });
  });

  it('scopes API changes by repository, method, and path', async () => {
    const prisma: PrismaMock = {
      apiChange: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      apiSnapshot: {
        findMany: jest.fn(),
      },
      detectedApi: {
        count: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          framework: ApiFramework.EXPRESS,
          method: ApiHttpMethod.POST,
          path: '/users',
          repositoryId: 'repository-id',
        }),
        findMany: jest.fn(),
      },
    };
    const repository = createRepository(prisma);

    await repository.listApiChanges('api-id', 'user-id', paginationOptions);

    expect(prisma.apiChange.findMany).toHaveBeenCalledWith({
      include: {
        newSnapshot: true,
        oldSnapshot: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: paginationOptions.offset,
      take: paginationOptions.limit,
      where: {
        AND: [
          {
            OR: [
              {
                apiId: 'api-id',
              },
              {
                newSnapshot: {
                  api: {
                    framework: ApiFramework.EXPRESS,
                    method: ApiHttpMethod.POST,
                    path: '/users',
                  },
                },
              },
              {
                oldSnapshot: {
                  api: {
                    framework: ApiFramework.EXPRESS,
                    method: ApiHttpMethod.POST,
                    path: '/users',
                  },
                },
              },
            ],
          },
        ],
        repositoryId: 'repository-id',
      },
    });
  });

  it('paginates and filters repository APIs at the database boundary', async () => {
    const prisma: PrismaMock = {
      apiChange: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      apiSnapshot: {
        findMany: jest.fn(),
      },
      detectedApi: {
        count: jest.fn().mockResolvedValue(125),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = createRepository(prisma);

    await repository.listApisForRepository('repository-id', {
      framework: ApiFramework.NESTJS,
      limit: 50,
      method: ApiHttpMethod.GET,
      offset: 50,
      search: 'users',
    });

    expect(prisma.detectedApi.findMany).toHaveBeenCalledWith({
      orderBy: [
        {
          path: 'asc',
        },
        {
          method: 'asc',
        },
      ],
      skip: 50,
      take: 50,
      where: {
        framework: ApiFramework.NESTJS,
        method: ApiHttpMethod.GET,
        OR: [
          {
            controllerName: {
              contains: 'users',
              mode: 'insensitive',
            },
          },
          {
            filePath: {
              contains: 'users',
              mode: 'insensitive',
            },
          },
          {
            handlerName: {
              contains: 'users',
              mode: 'insensitive',
            },
          },
          {
            path: {
              contains: 'users',
              mode: 'insensitive',
            },
          },
        ],
        repositoryId: 'repository-id',
      },
    });
    expect(prisma.detectedApi.count).toHaveBeenCalledWith({
      where: {
        framework: ApiFramework.NESTJS,
        method: ApiHttpMethod.GET,
        OR: [
          {
            controllerName: {
              contains: 'users',
              mode: 'insensitive',
            },
          },
          {
            filePath: {
              contains: 'users',
              mode: 'insensitive',
            },
          },
          {
            handlerName: {
              contains: 'users',
              mode: 'insensitive',
            },
          },
          {
            path: {
              contains: 'users',
              mode: 'insensitive',
            },
          },
        ],
        repositoryId: 'repository-id',
      },
    });
  });
});
