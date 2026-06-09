import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RepositoryProvider } from '@prisma/client';

import {
  GITHUB_DEFAULT_SCOPES,
  GITHUB_PROVIDER_NAME,
  type OAuthRepositoryProvider,
} from '../integrations.constants';
import {
  assertRecord,
  getBooleanProperty,
  getNumberProperty,
  getRequiredStringOrNumberProperty,
  getRequiredStringProperty,
  getStringProperty,
  fetchProviderJson,
  splitScopeString,
} from './provider-response.util';

import type {
  GitProvider,
  ProviderConnectionIdentity,
  ProviderRepositoryMetadata,
  ProviderTokenSet,
  StoredProviderCredentials,
} from '../interfaces/git-provider.interface';

interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_MAX_REPOSITORY_PAGES = 50;
const GITHUB_REPOSITORY_PAGE_SIZE = 100;

@Injectable()
export class GithubProvider implements GitProvider {
  readonly provider: OAuthRepositoryProvider = RepositoryProvider.GITHUB;
  private readonly requestTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.requestTimeoutMs = this.configService.getOrThrow<number>('oauth.providerRequestTimeoutMs');
  }

  getAuthorizationUrl(state: string): string {
    const config = this.getClientConfig();
    const url = new URL(GITHUB_AUTHORIZE_URL);

    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.callbackUrl);
    url.searchParams.set('scope', GITHUB_DEFAULT_SCOPES.join(' '));
    url.searchParams.set('state', state);

    return url.toString();
  }

  async connect(code: string): Promise<ProviderConnectionIdentity> {
    const tokenSet = await this.exchangeCodeForToken(code);
    const profile = await this.fetchUserProfile(tokenSet.accessToken);

    return {
      ...tokenSet,
      displayName: getStringProperty(profile, 'name'),
      providerUserId: getRequiredStringOrNumberProperty(profile, 'id', 'GitHub user profile'),
      username: getRequiredStringProperty(profile, 'login', 'GitHub user profile'),
    };
  }

  async disconnect(credentials: StoredProviderCredentials): Promise<void> {
    const config = this.getClientConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    try {
      const response = await fetch(
        `${GITHUB_API_URL}/applications/${encodeURIComponent(config.clientId)}/token`,
        {
          body: JSON.stringify({
            access_token: credentials.accessToken,
          }),
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: this.createBasicAuthHeader(config),
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
          },
          method: 'DELETE',
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new BadGatewayException('GitHub OAuth token revocation failed.');
      }
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException('GitHub OAuth token revocation failed.');
    } finally {
      clearTimeout(timeout);
    }
  }

  async refreshToken(refreshToken: string): Promise<ProviderTokenSet> {
    const config = this.getClientConfig();
    const payload = await fetchProviderJson(
      GITHUB_TOKEN_URL,
      {
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
      GITHUB_PROVIDER_NAME,
      this.requestTimeoutMs,
    );

    return this.parseTokenSet(payload);
  }

  async listRepositories(
    credentials: StoredProviderCredentials,
  ): Promise<ProviderRepositoryMetadata[]> {
    const repositories: ProviderRepositoryMetadata[] = [];

    for (let page = 1; page <= GITHUB_MAX_REPOSITORY_PAGES; page += 1) {
      const url = new URL(`${GITHUB_API_URL}/user/repos`);
      url.searchParams.set('affiliation', 'owner,collaborator,organization_member');
      url.searchParams.set('page', page.toString());
      url.searchParams.set('per_page', GITHUB_REPOSITORY_PAGE_SIZE.toString());
      url.searchParams.set('sort', 'updated');

      const payload = await fetchProviderJson(
        url,
        {
          headers: this.createApiHeaders(credentials.accessToken),
          method: 'GET',
        },
        GITHUB_PROVIDER_NAME,
        this.requestTimeoutMs,
      );

      if (!Array.isArray(payload)) {
        throw new BadGatewayException('GitHub repositories response was invalid.');
      }

      repositories.push(...payload.map((repository) => this.mapRepository(repository)));

      if (payload.length < GITHUB_REPOSITORY_PAGE_SIZE) {
        return repositories;
      }
    }

    throw new BadGatewayException(
      'GitHub repository pagination exceeded the configured safety limit.',
    );
  }

  async getRepository(
    credentials: StoredProviderCredentials,
    externalId: string,
  ): Promise<ProviderRepositoryMetadata> {
    const payload = await fetchProviderJson(
      `${GITHUB_API_URL}/repositories/${encodeURIComponent(externalId)}`,
      {
        headers: this.createApiHeaders(credentials.accessToken),
        method: 'GET',
      },
      GITHUB_PROVIDER_NAME,
      this.requestTimeoutMs,
    );

    return this.mapRepository(payload);
  }

  cloneRepositoryMetadata(repository: ProviderRepositoryMetadata): ProviderRepositoryMetadata {
    return { ...repository };
  }

  async validateConnection(credentials: StoredProviderCredentials): Promise<boolean> {
    try {
      await this.fetchUserProfile(credentials.accessToken);
      return true;
    } catch {
      return false;
    }
  }

  private async exchangeCodeForToken(code: string): Promise<ProviderTokenSet> {
    const config = this.getClientConfig();
    const payload = await fetchProviderJson(
      GITHUB_TOKEN_URL,
      {
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.callbackUrl,
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
      GITHUB_PROVIDER_NAME,
      this.requestTimeoutMs,
    );

    return this.parseTokenSet(payload);
  }

  private async fetchUserProfile(accessToken: string): Promise<Record<string, unknown>> {
    const payload = await fetchProviderJson(
      `${GITHUB_API_URL}/user`,
      {
        headers: this.createApiHeaders(accessToken),
        method: 'GET',
      },
      GITHUB_PROVIDER_NAME,
      this.requestTimeoutMs,
    );

    return assertRecord(payload, 'GitHub user profile');
  }

  private parseTokenSet(payload: unknown): ProviderTokenSet {
    const record = assertRecord(payload, 'GitHub token response');
    const error = getStringProperty(record, 'error');

    if (error) {
      throw new BadGatewayException('GitHub OAuth token exchange failed.');
    }

    const expiresInSeconds = getNumberProperty(record, 'expires_in');

    return {
      accessToken: getRequiredStringProperty(record, 'access_token', 'GitHub token response'),
      expiresAt: expiresInSeconds === null ? null : new Date(Date.now() + expiresInSeconds * 1000),
      refreshToken: getStringProperty(record, 'refresh_token'),
      scopes: splitScopeString(getStringProperty(record, 'scope')),
    };
  }

  private mapRepository(value: unknown): ProviderRepositoryMetadata {
    const record = assertRecord(value, 'GitHub repository');
    const isPrivate = getBooleanProperty(record, 'private');

    return {
      defaultBranch: getStringProperty(record, 'default_branch'),
      externalId: getRequiredStringOrNumberProperty(record, 'id', 'GitHub repository'),
      fullName: getRequiredStringProperty(record, 'full_name', 'GitHub repository'),
      language: getStringProperty(record, 'language'),
      name: getRequiredStringProperty(record, 'name', 'GitHub repository'),
      url: getRequiredStringProperty(record, 'html_url', 'GitHub repository'),
      visibility:
        getStringProperty(record, 'visibility') ?? (isPrivate === true ? 'private' : 'public'),
    };
  }

  private createApiHeaders(accessToken: string): HeadersInit {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    };
  }

  private createBasicAuthHeader(config: OAuthClientConfig): string {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

    return `Basic ${credentials}`;
  }

  private getClientConfig(): OAuthClientConfig {
    const config = {
      callbackUrl: this.configService.getOrThrow<string>('oauth.github.callbackUrl'),
      clientId: this.configService.getOrThrow<string>('oauth.github.clientId'),
      clientSecret: this.configService.getOrThrow<string>('oauth.github.clientSecret'),
    };

    if (!config.clientId || !config.clientSecret) {
      throw new ServiceUnavailableException(
        'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL before connecting GitHub repositories.',
      );
    }

    return config;
  }
}
