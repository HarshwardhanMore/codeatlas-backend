import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';

import type { DetectedApiWithDocumentation } from '../types/api-intelligence.types';
import type {
  ApiChange,
  ApiChangeSeverity,
  ApiChangeType,
  ApiFramework,
  ApiHttpMethod,
  ApiSnapshot,
  DetectedApi,
  Prisma,
  Repository,
  ScanJob,
} from '@prisma/client';

export type ApiChangeWithSnapshots = ApiChange & {
  newSnapshot: ApiSnapshot | null;
  oldSnapshot: ApiSnapshot | null;
};

export interface PaginatedRepositoryResult<TItem> {
  items: TItem[];
  total: number;
}

export interface ListApisForRepositoryOptions {
  framework?: ApiFramework;
  limit: number;
  method?: ApiHttpMethod;
  offset: number;
  search?: string;
}

export interface ListApiChangesOptions {
  changeType?: ApiChangeType;
  limit: number;
  offset: number;
  search?: string;
  severity?: ApiChangeSeverity;
}

@Injectable()
export class ApiCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRepositoryForUser(repositoryId: string, userId: string): Promise<Repository | null> {
    return this.prisma.repository.findFirst({
      where: {
        id: repositoryId,
        ownerId: userId,
      },
    });
  }

  async listApisForRepository(
    repositoryId: string,
    options: ListApisForRepositoryOptions,
  ): Promise<PaginatedRepositoryResult<DetectedApi>> {
    const where = this.buildDetectedApiWhere(repositoryId, options);
    const [items, total] = await Promise.all([
      this.prisma.detectedApi.findMany({
        orderBy: this.getApiOrderBy(),
        skip: options.offset,
        take: options.limit,
        where,
      }),
      this.prisma.detectedApi.count({
        where,
      }),
    ]);

    return {
      items,
      total,
    };
  }

  async listAllApisForRepository(repositoryId: string): Promise<DetectedApi[]> {
    return this.prisma.detectedApi.findMany({
      orderBy: this.getApiOrderBy(),
      where: {
        repositoryId,
      },
    });
  }

  async findApiForUser(
    apiId: string,
    userId: string,
  ): Promise<DetectedApiWithDocumentation | null> {
    return this.prisma.detectedApi.findFirst({
      include: {
        apiDocumentation: {
          select: {
            markdown: true,
            openApiJson: true,
          },
        },
      },
      where: {
        id: apiId,
        repository: {
          ownerId: userId,
        },
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

  async listApiHistory(apiId: string, userId: string): Promise<ApiSnapshot[] | null> {
    const api = await this.prisma.detectedApi.findFirst({
      select: {
        framework: true,
        method: true,
        path: true,
        repositoryId: true,
      },
      where: {
        id: apiId,
        repository: {
          ownerId: userId,
        },
      },
    });

    if (!api) {
      return null;
    }

    return this.prisma.apiSnapshot.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        api: {
          framework: api.framework,
          method: api.method,
          path: api.path,
        },
        repositoryId: api.repositoryId,
      },
    });
  }

  async listApiChanges(
    apiId: string,
    userId: string,
    options: ListApiChangesOptions,
  ): Promise<PaginatedRepositoryResult<ApiChangeWithSnapshots> | null> {
    const api = await this.prisma.detectedApi.findFirst({
      select: {
        framework: true,
        method: true,
        path: true,
        repositoryId: true,
      },
      where: {
        id: apiId,
        repository: {
          ownerId: userId,
        },
      },
    });

    if (!api) {
      return null;
    }

    return this.listApiChangesByWhere(
      this.buildApiChangeWhere(api.repositoryId, options, {
        OR: [
          {
            apiId,
          },
          {
            newSnapshot: {
              api: {
                framework: api.framework,
                method: api.method,
                path: api.path,
              },
            },
          },
          {
            oldSnapshot: {
              api: {
                framework: api.framework,
                method: api.method,
                path: api.path,
              },
            },
          },
        ],
      }),
      options,
    );
  }

  async listRepositoryChanges(
    repositoryId: string,
    options: ListApiChangesOptions,
  ): Promise<PaginatedRepositoryResult<ApiChangeWithSnapshots>> {
    return this.listApiChangesByWhere(this.buildApiChangeWhere(repositoryId, options), options);
  }

  async listScanChanges(
    scanId: string,
    options: ListApiChangesOptions,
  ): Promise<PaginatedRepositoryResult<ApiChangeWithSnapshots>> {
    return this.listApiChangesByWhere(
      this.buildApiChangeWhere(undefined, options, {
        scanId,
      }),
      options,
    );
  }

  private async listApiChangesByWhere(
    where: Prisma.ApiChangeWhereInput,
    options: ListApiChangesOptions,
  ): Promise<PaginatedRepositoryResult<ApiChangeWithSnapshots>> {
    const [items, total] = await Promise.all([
      this.prisma.apiChange.findMany({
        include: {
          newSnapshot: true,
          oldSnapshot: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: options.offset,
        take: options.limit,
        where,
      }),
      this.prisma.apiChange.count({
        where,
      }),
    ]);

    return {
      items,
      total,
    };
  }

  private buildDetectedApiWhere(
    repositoryId: string,
    options: ListApisForRepositoryOptions,
  ): Prisma.DetectedApiWhereInput {
    const where: Prisma.DetectedApiWhereInput = {
      repositoryId,
    };
    const search = options.search?.trim();

    if (options.framework) {
      where.framework = options.framework;
    }

    if (options.method) {
      where.method = options.method;
    }

    if (search) {
      where.OR = [
        {
          controllerName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          filePath: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          handlerName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          path: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    return where;
  }

  private buildApiChangeWhere(
    repositoryId: string | undefined,
    options: ListApiChangesOptions,
    scope?: Prisma.ApiChangeWhereInput,
  ): Prisma.ApiChangeWhereInput {
    const filters: Prisma.ApiChangeWhereInput[] = [];
    const search = options.search?.trim();
    const where: Prisma.ApiChangeWhereInput = {};

    if (repositoryId) {
      where.repositoryId = repositoryId;
    }

    if (scope) {
      filters.push(scope);
    }

    if (options.changeType) {
      filters.push({
        changeType: options.changeType,
      });
    }

    if (options.severity) {
      filters.push({
        severity: options.severity,
      });
    }

    if (search) {
      filters.push({
        OR: [
          {
            api: {
              path: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
          {
            description: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (filters.length > 0) {
      where.AND = filters;
    }

    return where;
  }

  private getApiOrderBy(): Prisma.DetectedApiOrderByWithRelationInput[] {
    return [
      {
        path: 'asc',
      },
      {
        method: 'asc',
      },
    ];
  }
}
