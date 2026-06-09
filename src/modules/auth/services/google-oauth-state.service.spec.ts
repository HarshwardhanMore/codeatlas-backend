import { UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';

import { GOOGLE_OAUTH_STATE_TTL_MS } from '../auth.constants';
import { GoogleOAuthStateService } from './google-oauth-state.service';

const redisStore = new Map<string, string>();

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      getdel: jest.fn((key: string) => {
        const value = redisStore.get(key) ?? null;
        redisStore.delete(key);

        return Promise.resolve(value);
      }),
      quit: jest.fn(() => Promise.resolve()),
      set: jest.fn((key: string, value: string) => {
        redisStore.set(key, value);

        return Promise.resolve('OK');
      }),
    })),
  };
});

function createConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'services.redisUrl') {
        return 'redis://localhost:6379';
      }

      if (key === 'encryption.oauthEncryptionKey') {
        return 'test-oauth-state-signing-key-with-32-characters';
      }

      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService;
}

describe(GoogleOAuthStateService.name, () => {
  beforeEach(() => {
    redisStore.clear();
    jest.useRealTimers();
  });

  it('accepts a valid state exactly once', async () => {
    const service = new GoogleOAuthStateService(createConfigService());
    const state = await service.createState();
    const payload = await service.consumeState(state, state);

    expect(typeof payload.nonce).toBe('string');
    expect(payload.nonce.length).toBeGreaterThan(0);
    await expect(service.consumeState(state, state)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects missing state', async () => {
    const service = new GoogleOAuthStateService(createConfigService());

    await expect(service.consumeState(undefined, undefined)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects invalid state', async () => {
    const service = new GoogleOAuthStateService(createConfigService());
    const state = await service.createState();

    await expect(service.consumeState(`${state}tampered`, state)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects expired state', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-08T00:00:00.000Z'));
    const service = new GoogleOAuthStateService(createConfigService());
    const state = await service.createState();

    jest.advanceTimersByTime(GOOGLE_OAUTH_STATE_TTL_MS + 1);

    await expect(service.consumeState(state, state)).rejects.toThrow(UnauthorizedException);
  });
});
