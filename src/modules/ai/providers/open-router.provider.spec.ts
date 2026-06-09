import { ServiceUnavailableException } from '@nestjs/common';

import { OpenRouterProvider } from './open-router.provider';

import type { ConfigService } from '@nestjs/config';

function createConfigService(apiKey: string): ConfigService {
  return {
    getOrThrow: jest.fn((key: string): string => {
      const values: Record<string, string> = {
        'ai.openRouterApiKey': apiKey,
        'ai.providerTimeoutMs': '30000',
        'app.frontendOrigin': 'http://localhost:3000',
      };

      return values[key] ?? '';
    }),
  } as unknown as ConfigService;
}

describe(OpenRouterProvider.name, () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('calls OpenRouter chat completions and parses the response', async () => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: 'Repository authentication uses JwtGuard.',
                },
              },
            ],
            model: 'openai/gpt-5.2',
            usage: {
              completion_tokens: 12,
              prompt_tokens: 100,
              total_tokens: 112,
            },
          }),
        ok: true,
        status: 200,
      } as Response),
    );
    global.fetch = fetchMock;
    const provider = new OpenRouterProvider(createConfigService('openrouter-key'));

    const result = await provider.complete({
      messages: [
        {
          content: 'Answer from context only.',
          role: 'system',
        },
      ],
      model: 'openai/gpt-5.2',
      userId: 'user-id',
    });

    expect(result.content).toBe('Repository authentication uses JwtGuard.');
    expect(result.usage.totalTokens).toBe(112);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer openrouter-key',
      }),
    );
  });

  it('fails fast when OpenRouter is not configured', async () => {
    const provider = new OpenRouterProvider(createConfigService(''));

    await expect(
      provider.complete({
        messages: [],
        model: 'openai/gpt-5.2',
        userId: 'user-id',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('normalizes network failures without exposing provider internals', async () => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
      Promise.reject(new Error('connect ECONNREFUSED')),
    );
    global.fetch = fetchMock;
    const provider = new OpenRouterProvider(createConfigService('openrouter-key'));

    await expect(
      provider.complete({
        messages: [],
        model: 'openai/gpt-5.2',
        userId: 'user-id',
      }),
    ).rejects.toThrow('AI provider request failed.');
  });
});
