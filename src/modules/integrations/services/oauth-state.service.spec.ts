import { UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { RepositoryProvider } from '@prisma/client';

import { OAuthStateService } from './oauth-state.service';

function createConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn<string, [string]>((key) => {
      void key;
      return 'test-oauth-state-signing-key-with-32-characters';
    }),
  } as unknown as ConfigService;
}

describe(OAuthStateService.name, () => {
  it('creates signed state and verifies the expected provider', () => {
    const service = new OAuthStateService(createConfigService());

    const state = service.createState('user-id', RepositoryProvider.GITHUB);
    const payload = service.verifyState(state, RepositoryProvider.GITHUB);

    expect(payload.userId).toBe('user-id');
    expect(payload.provider).toBe(RepositoryProvider.GITHUB);
  });

  it('rejects tampered state', () => {
    const service = new OAuthStateService(createConfigService());
    const state = service.createState('user-id', RepositoryProvider.GITHUB);

    expect(() => service.verifyState(`${state}tampered`, RepositoryProvider.GITHUB)).toThrow(
      UnauthorizedException,
    );
  });
});
