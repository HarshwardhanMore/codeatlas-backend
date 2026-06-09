import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { RepositoryProvider, type Repository } from '@prisma/client';

import { ZipRepositoryStorageService } from './zip-repository-storage.service';
import { RepositoryConnectionsRepository } from '../../integrations/repositories/repository-connections.repository';
import { IntegrationsService } from '../../integrations/services/integrations.service';
import { DEFAULT_REPOSITORY_LIST_LIMIT } from '../dto/list-repositories-query.dto';
import { RepositoriesRepository } from '../repositories/repositories.repository';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { ImportRepositoryDto } from '../dto/import-repository.dto';
import type { ListRepositoriesQueryDto } from '../dto/list-repositories-query.dto';
import type { RepositoryListOptions } from '../repositories/repositories.repository';

export interface RepositoryResponse {
  id: string;
  provider: RepositoryProvider;
  externalId: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string | null;
  visibility: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryMutationResponse {
  repository: RepositoryResponse;
}

export interface PaginationResponse {
  hasNext: boolean;
  hasPrevious: boolean;
  limit: number;
  offset: number;
  total: number;
}

export interface PaginatedRepositoryResponse {
  items: RepositoryResponse[];
  pagination: PaginationResponse;
}

@Injectable()
export class RepositoriesService {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly repositoryConnectionsRepository: RepositoryConnectionsRepository,
    private readonly repositoriesRepository: RepositoriesRepository,
    private readonly zipRepositoryStorageService: ZipRepositoryStorageService,
  ) {}

  async listRepositories(
    user: AuthenticatedUser,
    query: ListRepositoriesQueryDto = {},
  ): Promise<RepositoryResponse[] | PaginatedRepositoryResponse> {
    const pagination = this.toRepositoryListOptions(query);

    if (!pagination) {
      const repositories = await this.repositoriesRepository.listByOwner(user.id);

      return repositories.map((repository) => this.toRepositoryResponse(repository));
    }

    const [repositories, total] = await Promise.all([
      this.repositoriesRepository.listByOwner(user.id, pagination),
      this.repositoriesRepository.countByOwner(user.id),
    ]);

    return {
      items: repositories.map((repository) => this.toRepositoryResponse(repository)),
      pagination: this.toPaginationResponse(total, pagination),
    };
  }

  async importRepository(
    user: AuthenticatedUser,
    dto: ImportRepositoryDto,
  ): Promise<RepositoryMutationResponse> {
    const metadata = await this.integrationsService.getRepositoryMetadataForConnection(
      user.id,
      dto.connectionId,
      dto.externalId,
    );
    const repository = await this.repositoriesRepository.upsertProviderRepository({
      connectionId: metadata.connection.id,
      metadata: metadata.repository,
      ownerId: user.id,
      provider: metadata.connection.provider,
    });

    return {
      repository: this.toRepositoryResponse(repository),
    };
  }

  async uploadZipRepository(
    user: AuthenticatedUser,
    file: Express.Multer.File | undefined,
  ): Promise<RepositoryMutationResponse> {
    const connection = await this.repositoryConnectionsRepository.upsertZipConnection(user.id);
    const repositoryId = randomUUID();
    const storedSource = await this.zipRepositoryStorageService.storeZipRepository({
      file,
      repositoryId,
      userId: user.id,
    });

    try {
      const repository = await this.repositoriesRepository.createZipRepository({
        archivePath: storedSource.archivePath,
        connectionId: connection.id,
        externalId: storedSource.externalId,
        fullName: storedSource.fullName,
        id: repositoryId,
        name: storedSource.name,
        ownerId: user.id,
        sourcePath: storedSource.sourcePath,
        uploadSizeBytes: storedSource.uploadSizeBytes,
        url: storedSource.url,
      });

      return {
        repository: this.toRepositoryResponse(repository),
      };
    } catch (error) {
      await this.zipRepositoryStorageService.removeStoredRepository(user.id, repositoryId);
      throw error;
    }
  }

  private toRepositoryResponse(repository: Repository): RepositoryResponse {
    return {
      createdAt: repository.createdAt.toISOString(),
      defaultBranch: repository.defaultBranch,
      externalId: repository.externalId,
      fullName: repository.fullName,
      id: repository.id,
      language: repository.language,
      name: repository.name,
      provider: repository.provider,
      updatedAt: repository.updatedAt.toISOString(),
      url: repository.url,
      visibility: repository.visibility,
    };
  }

  private toRepositoryListOptions(query: ListRepositoriesQueryDto): RepositoryListOptions | null {
    if (query.limit === undefined && query.offset === undefined) {
      return null;
    }

    return {
      limit: query.limit ?? DEFAULT_REPOSITORY_LIST_LIMIT,
      offset: query.offset ?? 0,
    };
  }

  private toPaginationResponse(total: number, options: RepositoryListOptions): PaginationResponse {
    return {
      hasNext: options.offset + options.limit < total,
      hasPrevious: options.offset > 0,
      limit: options.limit,
      offset: options.offset,
      total,
    };
  }
}
