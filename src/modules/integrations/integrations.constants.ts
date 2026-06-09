import { RepositoryProvider } from '@prisma/client';

export const OAUTH_REPOSITORY_PROVIDERS = [
  RepositoryProvider.GITHUB,
  RepositoryProvider.BITBUCKET,
] as const;

export type OAuthRepositoryProvider = (typeof OAUTH_REPOSITORY_PROVIDERS)[number];

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const TOKEN_REFRESH_WINDOW_MS = 60 * 1000;

export const GITHUB_PROVIDER_NAME = 'GitHub';
export const BITBUCKET_PROVIDER_NAME = 'Bitbucket';

export const GITHUB_DEFAULT_SCOPES = ['repo', 'read:user', 'user:email'] as const;
export const BITBUCKET_DEFAULT_SCOPES = ['account', 'repository'] as const;
