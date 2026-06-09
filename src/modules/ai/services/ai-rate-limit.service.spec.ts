import { HttpException } from '@nestjs/common';

import { AiRateLimitService } from './ai-rate-limit.service';

import type { ConfigService } from '@nestjs/config';

const mockRedisCounts = new Map<string, number>();
const mockExpire = jest.fn(() => Promise.resolve(1));
const mockQuit = jest.fn(() => Promise.resolve('OK'));

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      expire: mockExpire,
      incr: jest.fn((key: string) => {
        const nextCount = (mockRedisCounts.get(key) ?? 0) + 1;
        mockRedisCounts.set(key, nextCount);

        return Promise.resolve(nextCount);
      }),
      quit: mockQuit,
    })),
  };
});

function createConfigService(limitPerMinute: number): ConfigService {
  return {
    getOrThrow: jest.fn((key: string): number | string => {
      if (key === 'ai.rateLimitPerMinute') {
        return limitPerMinute;
      }

      if (key === 'services.redisUrl') {
        return 'redis://localhost:6379';
      }

      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService;
}

describe(AiRateLimitService.name, () => {
  beforeEach(() => {
    mockRedisCounts.clear();
    mockExpire.mockClear();
    mockQuit.mockClear();
  });

  it('limits requests by user through Redis window counters', async () => {
    const service = new AiRateLimitService(createConfigService(1));

    await expect(service.assertAllowed('user-id')).resolves.toBeUndefined();
    await expect(service.assertAllowed('user-id')).rejects.toThrow(HttpException);
    await expect(service.assertAllowed('other-user-id')).resolves.toBeUndefined();
    expect(mockExpire).toHaveBeenCalledTimes(2);
  });
});
