import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RepositoryProvider } from '@prisma/client';

import {
  BITBUCKET_DEFAULT_SCOPES,
  BITBUCKET_PROVIDER_NAME,
  type OAuthRepositoryProvider,
} from '../integrations.constants';
import {
  assertRecord,
  fetchProviderJson,
  getBooleanProperty,
  getNumberProperty,
  getRecordProperty,
  getRequiredStringProperty,
  getStringProperty,
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

const BITBUCKET_AUTHORIZE_URL = 'https://bitbucket.org/site/oauth2/authorize';
const BITBUCKET_TOKEN_URL = 'https://bitbucket.org/site/oauth2/access_token';
const BITBUCKET_REVOKE_URL = 'https://bitbucket.org/site/oauth2/revoke';
const BITBUCKET_API_URL = 'https://api.bitbucket.org/2.0';
const BITBUCKET_MAX_REPOSITORY_PAGES = 20;

@Injectable()
export class BitbucketProvider implements GitProvider {
  readonly provider: OAuthRepositoryProvider = RepositoryProvider.BITBUCKET;
  private readonly requestTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.requestTimeoutMs = this.configService.getOrThrow<number>('oauth.providerRequestTimeoutMs');
  }

  getAuthorizationUrl(state: string): string {
    const config = this.getClientConfig();
    const url = new URL(BITBUCKET_AUTHORIZE_URL);

    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', BITBUCKET_DEFAULT_SCOPES.join(' '));
    url.searchParams.set('state', state);

    return url.toString();
  }

  async connect(code: string): Promise<ProviderConnectionIdentity> {
    const tokenSet = await this.exchangeCodeForToken(code);
    const profile = await this.fetchUserProfile(tokenSet.accessToken);

    return {
      ...tokenSet,
      displayName: getStringProperty(profile, 'display_name'),
      providerUserId: getRequiredStringProperty(profile, 'uuid', 'Bitbucket user profile'),
      username:
        getStringProperty(profile, 'username') ??
        getRequiredStringProperty(profile, 'display_name', 'Bitbucket user profile'),
    };
  }

  async disconnect(credentials: StoredProviderCredentials): Promise<void> {
    const tokens = [credentials.accessToken, credentials.refreshToken].filter(
      (token): token is string => Boolean(token),
    );
    const results = await Promise.allSettled(tokens.map((token) => this.revokeToken(token)));

    if (results.some((result) => result.status === 'rejected')) {
      throw new BadGatewayException('Bitbucket OAuth token revocation failed.');
    }
  }

  async refreshToken(refreshToken: string): Promise<ProviderTokenSet> {
    const payload = await fetchProviderJson(
      BITBUCKET_TOKEN_URL,
      {
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        headers: {
          Authorization: this.createBasicAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      },
      BITBUCKET_PROVIDER_NAME,
      this.requestTimeoutMs,
    );

    return this.parseTokenSet(payload);
  }

  async listRepositories(
    credentials: StoredProviderCredentials,
  ): Promise<ProviderRepositoryMetadata[]> {
    const repositories: ProviderRepositoryMetadata[] = [];
    const visitedPages = new Set<string>();
    let nextUrl: string | null = `${BITBUCKET_API_URL}/repositories?role=member&pagelen=100`;

    while (nextUrl) {
      if (visitedPages.has(nextUrl) || visitedPages.size >= BITBUCKET_MAX_REPOSITORY_PAGES) {
        throw new BadGatewayException('Bitbucket repository pagination was invalid.');
      }

      visitedPages.add(nextUrl);

      const rawPayload = await fetchProviderJson(
        nextUrl,
        {
          headers: this.createApiHeaders(credentials.accessToken),
          method: 'GET',
        },
        BITBUCKET_PROVIDER_NAME,
        this.requestTimeoutMs,
      );
      const payload = assertRecord(rawPayload, 'Bitbucket repositories response');
      const values = payload['values'];

      if (!Array.isArray(values)) {
        throw new BadGatewayException('Bitbucket repositories response was invalid.');
      }

      repositories.push(...values.map((repository) => this.mapRepository(repository)));
      nextUrl = getStringProperty(payload, 'next');
    }

    return repositories;
  }

  async getRepository(
    credentials: StoredProviderCredentials,
    externalId: string,
  ): Promise<ProviderRepositoryMetadata> {
    const repositories = await this.listRepositories(credentials);
    const repository = repositories.find((item) => item.externalId === externalId);

    if (!repository) {
      throw new BadGatewayException('Bitbucket repository was not found.');
    }

    return repository;
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
      BITBUCKET_TOKEN_URL,
      {
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: config.callbackUrl,
        }),
        headers: {
          Authorization: this.createBasicAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      },
      BITBUCKET_PROVIDER_NAME,
      this.requestTimeoutMs,
    );

    return this.parseTokenSet(payload);
  }

  private async fetchUserProfile(accessToken: string): Promise<Record<string, unknown>> {
    const payload = await fetchProviderJson(
      `${BITBUCKET_API_URL}/user`,
      {
        headers: this.createApiHeaders(accessToken),
        method: 'GET',
      },
      BITBUCKET_PROVIDER_NAME,
      this.requestTimeoutMs,
    );

    return assertRecord(payload, 'Bitbucket user profile');
  }

  private parseTokenSet(payload: unknown): ProviderTokenSet {
    const record = assertRecord(payload, 'Bitbucket token response');
    const error = getStringProperty(record, 'error');

    if (error) {
      throw new BadGatewayException('Bitbucket OAuth token exchange failed.');
    }

    const expiresInSeconds = getNumberProperty(record, 'expires_in');

    return {
      accessToken: getRequiredStringProperty(record, 'access_token', 'Bitbucket token response'),
      expiresAt: expiresInSeconds === null ? null : new Date(Date.now() + expiresInSeconds * 1000),
      refreshToken: getStringProperty(record, 'refresh_token'),
      scopes: splitScopeString(getStringProperty(record, 'scopes')),
    };
  }

  private mapRepository(value: unknown): ProviderRepositoryMetadata {
    const record = assertRecord(value, 'Bitbucket repository');
    const links = getRecordProperty(record, 'links');
    const htmlLink = links ? getRecordProperty(links, 'html') : null;
    const mainBranch = getRecordProperty(record, 'mainbranch');
    const isPrivate = getBooleanProperty(record, 'is_private');

    return {
      defaultBranch: mainBranch ? getStringProperty(mainBranch, 'name') : null,
      externalId: getRequiredStringProperty(record, 'uuid', 'Bitbucket repository'),
      fullName: getRequiredStringProperty(record, 'full_name', 'Bitbucket repository'),
      language: getStringProperty(record, 'language'),
      name: getRequiredStringProperty(record, 'name', 'Bitbucket repository'),
      url: htmlLink
        ? getRequiredStringProperty(htmlLink, 'href', 'Bitbucket repository links')
        : getRequiredStringProperty(record, 'website', 'Bitbucket repository'),
      visibility: isPrivate === true ? 'private' : 'public',
    };
  }

  private createApiHeaders(accessToken: string): HeadersInit {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };
  }

  private createBasicAuthHeader(): string {
    const config = this.getClientConfig();
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

    return `Basic ${credentials}`;
  }

  private async revokeToken(token: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    try {
      const response = await fetch(BITBUCKET_REVOKE_URL, {
        body: new URLSearchParams({
          token,
        }),
        headers: {
          Authorization: this.createBasicAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException('Bitbucket OAuth token revocation failed.');
      }
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException('Bitbucket OAuth token revocation failed.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private getClientConfig(): OAuthClientConfig {
    const config = {
      callbackUrl: this.configService.getOrThrow<string>('oauth.bitbucket.callbackUrl'),
      clientId: this.configService.getOrThrow<string>('oauth.bitbucket.clientId'),
      clientSecret: this.configService.getOrThrow<string>('oauth.bitbucket.clientSecret'),
    };

    if (!config.clientId || !config.clientSecret) {
      throw new ServiceUnavailableException(
        'Bitbucket OAuth is not configured. Set BITBUCKET_CLIENT_ID, BITBUCKET_CLIENT_SECRET, and BITBUCKET_CALLBACK_URL before connecting Bitbucket repositories.',
      );
    }

    return config;
  }
}
