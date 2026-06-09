import { Injectable, NotFoundException } from '@nestjs/common';

import { OpenApiGeneratorService } from '../openapi/openapi-generator.service';
import { ApiCatalogRepository } from '../repositories/api-catalog.repository';

import type { AuthenticatedUser } from '../../../../common/types/authenticated-user';
import type { ListApiCatalogQueryDto } from '../dto/list-api-catalog-query.dto';
import type { ListApiChangesQueryDto } from '../dto/list-api-changes-query.dto';
import type { PaginationQueryDto } from '../dto/pagination-query.dto';
import type { OpenApiDocument } from '../openapi/openapi-generator.service';
import type { ApiChangeWithSnapshots } from '../repositories/api-catalog.repository';
import type {
  ApiChangeSeverity,
  ApiChangeType,
  ApiFramework,
  ApiHttpMethod,
  ApiSnapshot,
  DetectedApi,
  Prisma,
  Repository,
} from '@prisma/client';

export interface DetectedApiResponse {
  id: string;
  repositoryId: string;
  scanId: string;
  method: ApiHttpMethod;
  path: string;
  framework: ApiFramework;
  controllerName: string | null;
  handlerName: string | null;
  filePath: string;
  lineNumber: number;
  requestSchema: Prisma.JsonValue | null;
  responseSchema: Prisma.JsonValue | null;
  authMetadata: Prisma.JsonValue | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiDocumentationResponse {
  api: DetectedApiResponse;
  documentation: {
    markdown: string;
    openApiJson: Prisma.JsonValue;
  } | null;
}

export interface ApiSnapshotResponse {
  id: string;
  apiId: string;
  scanId: string;
  version: number;
  contractHash: string;
  schemaJson: Prisma.JsonValue;
  createdAt: string;
}

export interface ApiChangeResponse {
  id: string;
  repositoryId: string;
  scanId: string;
  apiId: string;
  oldSnapshotId: string | null;
  newSnapshotId: string | null;
  changeType: ApiChangeType;
  severity: ApiChangeSeverity;
  description: string;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
  oldSnapshot: ApiSnapshotResponse | null;
  newSnapshot: ApiSnapshotResponse | null;
}

export interface PaginationResponse {
  hasNext: boolean;
  hasPrevious: boolean;
  limit: number;
  offset: number;
  total: number;
}

export interface PaginatedResponse<TItem> {
  items: TItem[];
  pagination: PaginationResponse;
}

@Injectable()
export class ApiCatalogService {
  constructor(
    private readonly apiCatalogRepository: ApiCatalogRepository,
    private readonly openApiGenerator: OpenApiGeneratorService,
  ) {}

  async listRepositoryApis(
    user: AuthenticatedUser,
    repositoryId: string,
    query: ListApiCatalogQueryDto,
  ): Promise<PaginatedResponse<DetectedApiResponse>> {
    await this.assertRepositoryOwnership(repositoryId, user.id);
    const result = await this.apiCatalogRepository.listApisForRepository(repositoryId, query);

    return this.toPaginatedResponse(
      result.items.map((api) => this.toDetectedApiResponse(api)),
      result.total,
      query,
    );
  }

  async getApi(user: AuthenticatedUser, apiId: string): Promise<ApiDocumentationResponse> {
    const api = await this.apiCatalogRepository.findApiForUser(apiId, user.id);

    if (!api) {
      throw new NotFoundException('API was not found.');
    }

    return {
      api: this.toDetectedApiResponse(api),
      documentation: api.apiDocumentation,
    };
  }

  async getRepositoryOpenApi(
    user: AuthenticatedUser,
    repositoryId: string,
  ): Promise<OpenApiDocument> {
    const repository = await this.assertRepositoryOwnership(repositoryId, user.id);
    const apis = await this.apiCatalogRepository.listAllApisForRepository(repositoryId);

    return this.openApiGenerator.generateRepositoryDocumentFromRecords(repository.fullName, apis);
  }

  async listApiHistory(user: AuthenticatedUser, apiId: string): Promise<ApiSnapshotResponse[]> {
    const snapshots = await this.apiCatalogRepository.listApiHistory(apiId, user.id);

    if (!snapshots) {
      throw new NotFoundException('API was not found.');
    }

    return snapshots.map((snapshot) => this.toApiSnapshotResponse(snapshot));
  }

  async listApiChanges(
    user: AuthenticatedUser,
    apiId: string,
    query: ListApiChangesQueryDto,
  ): Promise<PaginatedResponse<ApiChangeResponse>> {
    const changes = await this.apiCatalogRepository.listApiChanges(apiId, user.id, query);

    if (!changes) {
      throw new NotFoundException('API was not found.');
    }

    return this.toPaginatedResponse(
      changes.items.map((change) => this.toApiChangeResponse(change)),
      changes.total,
      query,
    );
  }

  async listRepositoryChanges(
    user: AuthenticatedUser,
    repositoryId: string,
    query: ListApiChangesQueryDto,
  ): Promise<PaginatedResponse<ApiChangeResponse>> {
    await this.assertRepositoryOwnership(repositoryId, user.id);
    const changes = await this.apiCatalogRepository.listRepositoryChanges(repositoryId, query);

    return this.toPaginatedResponse(
      changes.items.map((change) => this.toApiChangeResponse(change)),
      changes.total,
      query,
    );
  }

  async listScanChanges(
    user: AuthenticatedUser,
    scanId: string,
    query: ListApiChangesQueryDto,
  ): Promise<PaginatedResponse<ApiChangeResponse>> {
    const scan = await this.apiCatalogRepository.findScanForUser(scanId, user.id);

    if (!scan) {
      throw new NotFoundException('Scan was not found.');
    }

    const changes = await this.apiCatalogRepository.listScanChanges(scanId, query);

    return this.toPaginatedResponse(
      changes.items.map((change) => this.toApiChangeResponse(change)),
      changes.total,
      query,
    );
  }

  private async assertRepositoryOwnership(
    repositoryId: string,
    userId: string,
  ): Promise<Repository> {
    const repository = await this.apiCatalogRepository.findRepositoryForUser(repositoryId, userId);

    if (!repository) {
      throw new NotFoundException('Repository was not found.');
    }

    return repository;
  }

  private toDetectedApiResponse(api: DetectedApi): DetectedApiResponse {
    return {
      authMetadata: api.authMetadata,
      controllerName: api.controllerName,
      createdAt: api.createdAt.toISOString(),
      filePath: api.filePath,
      framework: api.framework,
      handlerName: api.handlerName,
      id: api.id,
      lineNumber: api.lineNumber,
      method: api.method,
      path: api.path,
      repositoryId: api.repositoryId,
      requestSchema: api.requestSchema,
      responseSchema: api.responseSchema,
      scanId: api.scanId,
      updatedAt: api.updatedAt.toISOString(),
    };
  }

  private toPaginatedResponse<TItem>(
    items: TItem[],
    total: number,
    query: PaginationQueryDto,
  ): PaginatedResponse<TItem> {
    return {
      items,
      pagination: {
        hasNext: query.offset + query.limit < total,
        hasPrevious: query.offset > 0,
        limit: query.limit,
        offset: query.offset,
        total,
      },
    };
  }

  private toApiSnapshotResponse(snapshot: ApiSnapshot): ApiSnapshotResponse {
    return {
      apiId: snapshot.apiId,
      contractHash: snapshot.contractHash,
      createdAt: snapshot.createdAt.toISOString(),
      id: snapshot.id,
      scanId: snapshot.scanId,
      schemaJson: snapshot.schemaJson,
      version: snapshot.version,
    };
  }

  private toApiChangeResponse(change: ApiChangeWithSnapshots): ApiChangeResponse {
    return {
      apiId: change.apiId,
      changeType: change.changeType,
      createdAt: change.createdAt.toISOString(),
      description: change.description,
      id: change.id,
      metadata: change.metadata,
      newSnapshot: change.newSnapshot ? this.toApiSnapshotResponse(change.newSnapshot) : null,
      newSnapshotId: change.newSnapshotId,
      oldSnapshot: change.oldSnapshot ? this.toApiSnapshotResponse(change.oldSnapshot) : null,
      oldSnapshotId: change.oldSnapshotId,
      repositoryId: change.repositoryId,
      scanId: change.scanId,
      severity: change.severity,
    };
  }
}
