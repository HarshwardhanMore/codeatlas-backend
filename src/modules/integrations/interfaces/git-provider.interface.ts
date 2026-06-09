import type { OAuthRepositoryProvider } from '../integrations.constants';

export interface ProviderTokenSet {
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: Date | null;
}

export interface ProviderConnectionIdentity extends ProviderTokenSet {
  providerUserId: string;
  username: string;
  displayName: string | null;
}

export interface StoredProviderCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

export interface ProviderRepositoryMetadata {
  externalId: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string | null;
  visibility: string | null;
  language: string | null;
}

export interface GitProvider {
  readonly provider: OAuthRepositoryProvider;
  getAuthorizationUrl(state: string): string;
  connect(code: string): Promise<ProviderConnectionIdentity>;
  disconnect(credentials: StoredProviderCredentials): Promise<void>;
  refreshToken(refreshToken: string): Promise<ProviderTokenSet>;
  listRepositories(credentials: StoredProviderCredentials): Promise<ProviderRepositoryMetadata[]>;
  getRepository(
    credentials: StoredProviderCredentials,
    externalId: string,
  ): Promise<ProviderRepositoryMetadata>;
  cloneRepositoryMetadata(repository: ProviderRepositoryMetadata): ProviderRepositoryMetadata;
  validateConnection(credentials: StoredProviderCredentials): Promise<boolean>;
}
