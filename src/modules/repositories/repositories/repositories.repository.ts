import { Injectable } from '@nestjs/common';
import { RepositoryProvider, type Repository } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import type { ProviderRepositoryMetadata } from '../../integrations/interfaces/git-provider.interface';

export interface UpsertProviderRepositoryInput {
  ownerId: string;
  connectionId: string;
  provider: RepositoryProvider;
  metadata: ProviderRepositoryMetadata;
}

export interface CreateZipRepositoryInput {
  id: string;
  ownerId: string;
  connectionId: string;
  externalId: string;
  name: string;
  fullName: string;
  url: string;
  sourcePath: string;
  archivePath: string;
  uploadSizeBytes: number;
}

export interface RepositoryListOptions {
  limit: number;
  offset: number;
}

@Injectable()
export class RepositoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByOwner(ownerId: string, options?: RepositoryListOptions): Promise<Repository[]> {
    return this.prisma.repository.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      skip: options?.offset,
      take: options?.limit,
      where: {
        ownerId,
      },
    });
  }

  countByOwner(ownerId: string): Promise<number> {
    return this.prisma.repository.count({
      where: {
        ownerId,
      },
    });
  }

  async upsertProviderRepository(input: UpsertProviderRepositoryInput): Promise<Repository> {
    return this.prisma.repository.upsert({
      create: {
        connectionId: input.connectionId,
        defaultBranch: input.metadata.defaultBranch,
        externalId: input.metadata.externalId,
        fullName: input.metadata.fullName,
        language: input.metadata.language,
        name: input.metadata.name,
        ownerId: input.ownerId,
        provider: input.provider,
        url: input.metadata.url,
        visibility: input.metadata.visibility,
      },
      update: {
        connectionId: input.connectionId,
        defaultBranch: input.metadata.defaultBranch,
        fullName: input.metadata.fullName,
        language: input.metadata.language,
        name: input.metadata.name,
        url: input.metadata.url,
        visibility: input.metadata.visibility,
      },
      where: {
        ownerId_provider_externalId: {
          externalId: input.metadata.externalId,
          ownerId: input.ownerId,
          provider: input.provider,
        },
      },
    });
  }

  async createZipRepository(input: CreateZipRepositoryInput): Promise<Repository> {
    return this.prisma.repository.create({
      data: {
        archivePath: input.archivePath,
        connectionId: input.connectionId,
        externalId: input.externalId,
        fullName: input.fullName,
        id: input.id,
        name: input.name,
        ownerId: input.ownerId,
        provider: RepositoryProvider.ZIP,
        sourcePath: input.sourcePath,
        uploadSizeBytes: input.uploadSizeBytes,
        url: input.url,
        visibility: 'private',
      },
    });
  }
}
