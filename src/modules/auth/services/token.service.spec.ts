import { UnauthorizedException } from '@nestjs/common';

import { TokenService } from './token.service';

import type { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { RefreshToken } from '@prisma/client';

const timestamp = new Date('2026-06-08T00:00:00.000Z');

const storedToken: RefreshToken = {
  createdAt: timestamp,
  expiresAt: new Date('2026-07-08T00:00:00.000Z'),
  familyId: '11111111-1111-4111-8111-111111111111',
  id: 'token-id',
  jti: '22222222-2222-4222-8222-222222222222',
  replacedByTokenId: null,
  revokedAt: null,
  tokenHash: 'a'.repeat(64),
  updatedAt: timestamp,
  userId: '33333333-3333-4333-8333-333333333333',
};

function createConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string): string => {
      const values: Record<string, string> = {
        'security.jwtRefreshExpiresIn': '30d',
        'security.jwtRefreshSecret': 'refresh-secret-with-at-least-32-chars',
      };

      return values[key] ?? '';
    }),
  } as unknown as ConfigService;
}

describe(TokenService.name, () => {
  it('revokes a refresh token family when rotation loses the single-use race', async () => {
    const jwtService = {
      signAsync: jest.fn<Promise<string>, [unknown, unknown]>(() =>
        Promise.resolve('next-refresh-token'),
      ),
    } as unknown as JwtService;
    const refreshTokensRepository = {
      revokeFamily: jest.fn<Promise<void>, [string]>(() => Promise.resolve()),
      rotate: jest.fn(() => Promise.resolve(null)),
    } as unknown as jest.Mocked<Pick<RefreshTokensRepository, 'revokeFamily' | 'rotate'>>;
    const service = new TokenService(
      createConfigService(),
      jwtService,
      refreshTokensRepository as unknown as RefreshTokensRepository,
    );

    await expect(service.rotateRefreshToken(storedToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshTokensRepository.revokeFamily).toHaveBeenCalledWith(storedToken.familyId);
  });
});
