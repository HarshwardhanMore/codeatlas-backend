import { BadRequestException, Injectable } from '@nestjs/common';

import { BitbucketProvider } from './bitbucket.provider';
import { GithubProvider } from './github.provider';
import {
  OAUTH_REPOSITORY_PROVIDERS,
  type OAuthRepositoryProvider,
} from '../integrations.constants';

import type { GitProvider } from '../interfaces/git-provider.interface';

@Injectable()
export class GitProviderRegistry {
  private readonly providers: ReadonlyMap<OAuthRepositoryProvider, GitProvider>;

  constructor(githubProvider: GithubProvider, bitbucketProvider: BitbucketProvider) {
    this.providers = new Map<OAuthRepositoryProvider, GitProvider>([
      [githubProvider.provider, githubProvider],
      [bitbucketProvider.provider, bitbucketProvider],
    ]);
  }

  getProvider(provider: OAuthRepositoryProvider): GitProvider {
    const gitProvider = this.providers.get(provider);

    if (!gitProvider) {
      throw new BadRequestException('Repository provider is not supported.');
    }

    return gitProvider;
  }

  isOAuthProvider(provider: string): provider is OAuthRepositoryProvider {
    return OAUTH_REPOSITORY_PROVIDERS.includes(provider as OAuthRepositoryProvider);
  }
}
