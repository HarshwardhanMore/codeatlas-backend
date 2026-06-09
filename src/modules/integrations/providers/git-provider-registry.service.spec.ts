import { RepositoryProvider } from '@prisma/client';

import { GitProviderRegistry } from './git-provider-registry.service';

import type { BitbucketProvider } from './bitbucket.provider';
import type { GithubProvider } from './github.provider';

describe(GitProviderRegistry.name, () => {
  it('returns GitHub and Bitbucket providers through the generic registry', () => {
    const githubProvider = { provider: RepositoryProvider.GITHUB } as GithubProvider;
    const bitbucketProvider = { provider: RepositoryProvider.BITBUCKET } as BitbucketProvider;
    const registry = new GitProviderRegistry(githubProvider, bitbucketProvider);

    expect(registry.getProvider(RepositoryProvider.GITHUB)).toBe(githubProvider);
    expect(registry.getProvider(RepositoryProvider.BITBUCKET)).toBe(bitbucketProvider);
  });

  it('does not treat ZIP as an OAuth provider', () => {
    const githubProvider = { provider: RepositoryProvider.GITHUB } as GithubProvider;
    const bitbucketProvider = { provider: RepositoryProvider.BITBUCKET } as BitbucketProvider;
    const registry = new GitProviderRegistry(githubProvider, bitbucketProvider);

    expect(registry.isOAuthProvider(RepositoryProvider.ZIP)).toBe(false);
  });
});
