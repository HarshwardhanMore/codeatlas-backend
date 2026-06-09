import { type ConfigService } from '@nestjs/config';

import { GithubProvider } from './github.provider';

function createConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, number | string> = {
        'oauth.github.callbackUrl': 'http://localhost:3001/api/v1/integrations/github/callback',
        'oauth.github.clientId': 'github-client-id',
        'oauth.github.clientSecret': 'github-client-secret',
        'oauth.providerRequestTimeoutMs': 1000,
      };

      return values[key];
    }),
  } as unknown as ConfigService;
}

function createGithubRepository(id: number): Record<string, unknown> {
  return {
    default_branch: 'main',
    full_name: `owner/repository-${id.toString()}`,
    html_url: `https://github.com/owner/repository-${id.toString()}`,
    id,
    language: 'TypeScript',
    name: `repository-${id.toString()}`,
    private: true,
    visibility: 'private',
  };
}

describe(GithubProvider.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists repositories across all GitHub pages', async () => {
    const firstPage = Array.from({ length: 100 }, (_value, index) =>
      createGithubRepository(index + 1),
    );
    const secondPage = Array.from({ length: 20 }, (_value, index) =>
      createGithubRepository(index + 101),
    );
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(firstPage), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(secondPage), {
          status: 200,
        }),
      );
    const provider = new GithubProvider(createConfigService());

    const repositories = await provider.listRepositories({
      accessToken: 'github-access-token',
      expiresAt: null,
      refreshToken: null,
    });

    expect(repositories).toHaveLength(120);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = fetchMock.mock.calls[0]?.[0];
    const secondUrl = fetchMock.mock.calls[1]?.[0];

    if (!(firstUrl instanceof URL) || !(secondUrl instanceof URL)) {
      throw new Error('GitHub repository calls should use URL objects.');
    }

    expect(firstUrl.searchParams.get('page')).toBe('1');
    expect(secondUrl.searchParams.get('page')).toBe('2');
  });
});
