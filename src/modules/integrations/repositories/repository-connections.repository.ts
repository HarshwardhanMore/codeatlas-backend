import { Injectable } from '@nestjs/common';
import {
  RepositoryConnectionStatus,
  RepositoryProvider,
  type RepositoryConnection,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export interface UpsertOAuthConnectionInput {
  userId: string;
  organizationId?: string | null;
  provider: RepositoryProvider;
  providerUserId: string;
  username: string;
  displayName: string | null;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  scopes: string[];
  expiresAt: Date | null;
}

export interface UpdateConnectionTokensInput {
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  scopes: string[];
  expiresAt: Date | null;
}

const ZIP_PROVIDER_USER_ID = 'zip-upload';
const ZIP_PROVIDER_DISPLAY_NAME = 'ZIP Uploads';

@Injectable()
export class RepositoryConnectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(userId: string): Promise<RepositoryConnection[]> {
    return this.prisma.repositoryConnection.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      where: {
        userId,
      },
    });
  }

  async findActiveByUserAndProvider(
    userId: string,
    provider: RepositoryProvider,
  ): Promise<RepositoryConnection | null> {
    return this.prisma.repositoryConnection.findFirst({
      orderBy: {
        updatedAt: 'desc',
      },
      where: {
        provider,
        status: RepositoryConnectionStatus.ACTIVE,
        userId,
      },
    });
  }

  async findActiveByIdForUser(id: string, userId: string): Promise<RepositoryConnection | null> {
    return this.prisma.repositoryConnection.findFirst({
      where: {
        id,
        status: RepositoryConnectionStatus.ACTIVE,
        userId,
      },
    });
  }

  async upsertOAuthConnection(input: UpsertOAuthConnectionInput): Promise<RepositoryConnection> {
    return this.prisma.repositoryConnection.upsert({
      create: {
        displayName: input.displayName,
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        expiresAt: input.expiresAt,
        lastValidatedAt: new Date(),
        organizationId: input.organizationId ?? null,
        provider: input.provider,
        providerUserId: input.providerUserId,
        scopes: input.scopes,
        status: RepositoryConnectionStatus.ACTIVE,
        userId: input.userId,
        username: input.username,
      },
      update: {
        displayName: input.displayName,
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        expiresAt: input.expiresAt,
        lastValidatedAt: new Date(),
        scopes: input.scopes,
        status: RepositoryConnectionStatus.ACTIVE,
        username: input.username,
      },
      where: {
        provider_providerUserId_userId: {
          provider: input.provider,
          providerUserId: input.providerUserId,
          userId: input.userId,
        },
      },
    });
  }

  async updateTokens(
    id: string,
    input: UpdateConnectionTokensInput,
  ): Promise<RepositoryConnection> {
    return this.prisma.repositoryConnection.update({
      data: {
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        expiresAt: input.expiresAt,
        lastValidatedAt: new Date(),
        scopes: input.scopes,
      },
      where: {
        id,
      },
    });
  }

  async markValidated(id: string): Promise<RepositoryConnection> {
    return this.prisma.repositoryConnection.update({
      data: {
        lastValidatedAt: new Date(),
      },
      where: {
        id,
      },
    });
  }

  async disconnectByUserAndProvider(userId: string, provider: RepositoryProvider): Promise<number> {
    const result = await this.prisma.repositoryConnection.updateMany({
      data: {
        status: RepositoryConnectionStatus.REVOKED,
      },
      where: {
        provider,
        status: RepositoryConnectionStatus.ACTIVE,
        userId,
      },
    });

    return result.count;
  }

  async upsertZipConnection(userId: string): Promise<RepositoryConnection> {
    return this.prisma.repositoryConnection.upsert({
      create: {
        displayName: ZIP_PROVIDER_DISPLAY_NAME,
        provider: RepositoryProvider.ZIP,
        providerUserId: ZIP_PROVIDER_USER_ID,
        status: RepositoryConnectionStatus.ACTIVE,
        userId,
        username: ZIP_PROVIDER_DISPLAY_NAME,
      },
      update: {
        status: RepositoryConnectionStatus.ACTIVE,
      },
      where: {
        provider_providerUserId_userId: {
          provider: RepositoryProvider.ZIP,
          providerUserId: ZIP_PROVIDER_USER_ID,
          userId,
        },
      },
    });
  }
}
