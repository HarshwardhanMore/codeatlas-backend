import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RepositoryProvider } from '@prisma/client';

import { OAuthStateService } from './oauth-state.service';
import { OAuthTokenEncryptionService } from './oauth-token-encryption.service';
import {
  OAUTH_REPOSITORY_PROVIDERS,
  TOKEN_REFRESH_WINDOW_MS,
  type OAuthRepositoryProvider,
} from '../integrations.constants';
import { GitProviderRegistry } from '../providers/git-provider-registry.service';
import { RepositoryConnectionsRepository } from '../repositories/repository-connections.repository';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { OAuthCallbackQueryDto } from '../dto/oauth-callback-query.dto';
import type {
  ProviderRepositoryMetadata,
  StoredProviderCredentials,
} from '../interfaces/git-provider.interface';
import type { RepositoryConnection } from '@prisma/client';

export interface AuthorizationUrlResponse {
  authorizationUrl: string;
}

export interface RepositoryConnectionResponse {
  id: string;
  provider: RepositoryProvider;
  providerUserId: string;
  username: string | null;
  displayName: string | null;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryProviderStatusResponse {
  provider: OAuthRepositoryProvider;
  connected: boolean;
  connection: RepositoryConnectionResponse | null;
}

export interface DisconnectProviderResponse {
  provider: OAuthRepositoryProvider;
  disconnected: boolean;
}

export interface RepositoryMetadataForConnection {
  connection: RepositoryConnection;
  repository: ProviderRepositoryMetadata;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly encryptionService: OAuthTokenEncryptionService,
    private readonly providerRegistry: GitProviderRegistry,
    private readonly repositoryConnectionsRepository: RepositoryConnectionsRepository,
    private readonly stateService: OAuthStateService,
  ) {}

  async listConnections(user: AuthenticatedUser): Promise<RepositoryConnectionResponse[]> {
    const connections = await this.repositoryConnectionsRepository.listByUser(user.id);

    return connections.map((connection) => this.toConnectionResponse(connection));
  }

  async getProviderStatus(
    user: AuthenticatedUser,
    provider: OAuthRepositoryProvider,
  ): Promise<RepositoryProviderStatusResponse> {
    const connection = await this.repositoryConnectionsRepository.findActiveByUserAndProvider(
      user.id,
      provider,
    );

    return {
      connected: Boolean(connection),
      connection: connection ? this.toConnectionResponse(connection) : null,
      provider,
    };
  }

  createAuthorizationUrl(
    user: AuthenticatedUser,
    provider: OAuthRepositoryProvider,
  ): AuthorizationUrlResponse {
    const state = this.stateService.createState(user.id, provider);
    const gitProvider = this.providerRegistry.getProvider(provider);

    return {
      authorizationUrl: gitProvider.getAuthorizationUrl(state),
    };
  }

  async handleOAuthCallback(
    provider: OAuthRepositoryProvider,
    query: OAuthCallbackQueryDto,
  ): Promise<string> {
    if (query.error) {
      return this.buildFrontendRedirect(provider, 'error', 'oauth_denied');
    }

    if (!query.code || !query.state) {
      return this.buildFrontendRedirect(provider, 'error', 'missing_oauth_code');
    }

    try {
      const payload = this.stateService.verifyState(query.state, provider);
      const gitProvider = this.providerRegistry.getProvider(provider);
      const identity = await gitProvider.connect(query.code);

      await this.repositoryConnectionsRepository.upsertOAuthConnection({
        displayName: identity.displayName,
        encryptedAccessToken: this.encryptionService.encrypt(identity.accessToken),
        encryptedRefreshToken: identity.refreshToken
          ? this.encryptionService.encrypt(identity.refreshToken)
          : null,
        expiresAt: identity.expiresAt,
        provider,
        providerUserId: identity.providerUserId,
        scopes: identity.scopes,
        userId: payload.userId,
        username: identity.username,
      });

      return this.buildFrontendRedirect(provider, 'connected');
    } catch {
      return this.buildFrontendRedirect(provider, 'error', 'oauth_failed');
    }
  }

  async listProviderRepositories(
    user: AuthenticatedUser,
    provider: OAuthRepositoryProvider,
  ): Promise<ProviderRepositoryMetadata[]> {
    const connection = await this.findActiveConnectionByProvider(user.id, provider);
    const credentials = await this.getCredentialsForConnection(connection);
    const gitProvider = this.providerRegistry.getProvider(provider);
    const repositories = await gitProvider.listRepositories(credentials);

    await this.repositoryConnectionsRepository.markValidated(connection.id);

    return repositories.map((repository) => gitProvider.cloneRepositoryMetadata(repository));
  }

  async getRepositoryMetadataForConnection(
    userId: string,
    connectionId: string,
    externalId: string,
  ): Promise<RepositoryMetadataForConnection> {
    const connection = await this.repositoryConnectionsRepository.findActiveByIdForUser(
      connectionId,
      userId,
    );

    if (!connection) {
      throw new NotFoundException('Repository connection was not found.');
    }

    const provider = this.assertOAuthProvider(connection.provider);
    const credentials = await this.getCredentialsForConnection(connection);
    const gitProvider = this.providerRegistry.getProvider(provider);
    const repository = await gitProvider.getRepository(credentials, externalId);

    return {
      connection,
      repository: gitProvider.cloneRepositoryMetadata(repository),
    };
  }

  async getCredentialsForConnection(
    connection: RepositoryConnection,
  ): Promise<StoredProviderCredentials> {
    const provider = this.assertOAuthProvider(connection.provider);

    if (!connection.encryptedAccessToken) {
      throw new ConflictException('Repository connection is missing credentials.');
    }

    const credentials: StoredProviderCredentials = {
      accessToken: this.encryptionService.decrypt(connection.encryptedAccessToken),
      expiresAt: connection.expiresAt,
      refreshToken: connection.encryptedRefreshToken
        ? this.encryptionService.decrypt(connection.encryptedRefreshToken)
        : null,
    };

    if (!this.shouldRefresh(credentials)) {
      return credentials;
    }

    if (!credentials.refreshToken) {
      throw new UnauthorizedException('Repository provider credentials have expired.');
    }

    const tokenSet = await this.providerRegistry
      .getProvider(provider)
      .refreshToken(credentials.refreshToken);
    const refreshToken = tokenSet.refreshToken ?? credentials.refreshToken;
    const updatedConnection = await this.repositoryConnectionsRepository.updateTokens(
      connection.id,
      {
        encryptedAccessToken: this.encryptionService.encrypt(tokenSet.accessToken),
        encryptedRefreshToken: refreshToken ? this.encryptionService.encrypt(refreshToken) : null,
        expiresAt: tokenSet.expiresAt,
        scopes: tokenSet.scopes.length > 0 ? tokenSet.scopes : connection.scopes,
      },
    );

    return {
      accessToken: this.encryptionService.decrypt(updatedConnection.encryptedAccessToken ?? ''),
      expiresAt: updatedConnection.expiresAt,
      refreshToken: updatedConnection.encryptedRefreshToken
        ? this.encryptionService.decrypt(updatedConnection.encryptedRefreshToken)
        : null,
    };
  }

  async disconnectProvider(
    user: AuthenticatedUser,
    provider: OAuthRepositoryProvider,
  ): Promise<DisconnectProviderResponse> {
    const connection = await this.repositoryConnectionsRepository.findActiveByUserAndProvider(
      user.id,
      provider,
    );

    if (connection?.encryptedAccessToken) {
      const gitProvider = this.providerRegistry.getProvider(provider);
      await gitProvider
        .disconnect(await this.getCredentialsForConnection(connection))
        .catch(() => undefined);
    }

    const disconnectedCount =
      await this.repositoryConnectionsRepository.disconnectByUserAndProvider(user.id, provider);

    return {
      disconnected: disconnectedCount > 0,
      provider,
    };
  }

  private async findActiveConnectionByProvider(
    userId: string,
    provider: OAuthRepositoryProvider,
  ): Promise<RepositoryConnection> {
    const connection = await this.repositoryConnectionsRepository.findActiveByUserAndProvider(
      userId,
      provider,
    );

    if (!connection) {
      throw new NotFoundException('Repository provider is not connected.');
    }

    return connection;
  }

  private shouldRefresh(credentials: StoredProviderCredentials): boolean {
    if (!credentials.expiresAt) {
      return false;
    }

    return credentials.expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_WINDOW_MS;
  }

  private assertOAuthProvider(provider: RepositoryProvider): OAuthRepositoryProvider {
    if (OAUTH_REPOSITORY_PROVIDERS.includes(provider as OAuthRepositoryProvider)) {
      return provider as OAuthRepositoryProvider;
    }

    throw new BadRequestException('Provider does not support OAuth repository operations.');
  }

  private buildFrontendRedirect(
    provider: OAuthRepositoryProvider,
    status: 'connected' | 'error',
    reason?: string,
  ): string {
    const frontendOrigin = this.configService.getOrThrow<string>('app.frontendOrigin');
    const url = new URL('/repositories/connect', frontendOrigin);

    url.searchParams.set('provider', provider.toLowerCase());
    url.searchParams.set('status', status);

    if (reason) {
      url.searchParams.set('reason', reason);
    }

    return url.toString();
  }

  private toConnectionResponse(connection: RepositoryConnection): RepositoryConnectionResponse {
    return {
      createdAt: connection.createdAt.toISOString(),
      displayName: connection.displayName,
      expiresAt: connection.expiresAt ? connection.expiresAt.toISOString() : null,
      id: connection.id,
      lastValidatedAt: connection.lastValidatedAt ? connection.lastValidatedAt.toISOString() : null,
      provider: connection.provider,
      providerUserId: connection.providerUserId,
      scopes: connection.scopes,
      status: connection.status,
      updatedAt: connection.updatedAt.toISOString(),
      username: connection.username,
    };
  }
}
