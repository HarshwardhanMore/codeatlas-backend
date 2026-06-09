import { randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { parseDurationToMilliseconds, toDurationString } from '../../../common/utils/duration.util';
import { hashToken } from '../../../common/utils/token-hash.util';
import { ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE } from '../auth.constants';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AccessTokenPayload, RefreshTokenPayload, StoredRefreshToken } from '../auth.types';

interface RefreshTokenMaterial {
  expiresAt: Date;
  familyId: string;
  jti: string;
  token: string;
  tokenHash: string;
  userId: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async issueAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: AccessTokenPayload = {
      email: user.email,
      permissions: user.permissions,
      roles: user.roles,
      sub: user.id,
      type: ACCESS_TOKEN_TYPE,
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: toDurationString(
        this.configService.getOrThrow<string>('security.jwtAccessExpiresIn'),
      ),
      secret: this.configService.getOrThrow<string>('security.jwtAccessSecret'),
    });
  }

  async issueRefreshToken(userId: string): Promise<string> {
    const tokenMaterial = await this.createRefreshTokenMaterial(userId, randomUUID());

    await this.refreshTokensRepository.create({
      expiresAt: tokenMaterial.expiresAt,
      familyId: tokenMaterial.familyId,
      jti: tokenMaterial.jti,
      tokenHash: tokenMaterial.tokenHash,
      userId: tokenMaterial.userId,
    });

    return tokenMaterial.token;
  }

  async validateRefreshToken(refreshToken: string): Promise<StoredRefreshToken> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);
    const storedToken = await this.refreshTokensRepository.findByTokenHash(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (storedToken.userId !== payload.sub || storedToken.jti !== payload.jti) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (storedToken.revokedAt) {
      await this.refreshTokensRepository.revokeFamily(storedToken.familyId);
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (storedToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired.');
    }

    return storedToken;
  }

  async rotateRefreshToken(storedToken: StoredRefreshToken): Promise<string> {
    const tokenMaterial = await this.createRefreshTokenMaterial(
      storedToken.userId,
      storedToken.familyId,
    );

    const rotatedToken = await this.refreshTokensRepository.rotate(storedToken.id, {
      expiresAt: tokenMaterial.expiresAt,
      familyId: tokenMaterial.familyId,
      jti: tokenMaterial.jti,
      tokenHash: tokenMaterial.tokenHash,
      userId: tokenMaterial.userId,
    });

    if (!rotatedToken) {
      await this.refreshTokensRepository.revokeFamily(storedToken.familyId);
      throw new UnauthorizedException('Invalid refresh token.');
    }

    return tokenMaterial.token;
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.refreshTokensRepository.revokeByTokenHash(hashToken(refreshToken));
  }

  private async createRefreshTokenMaterial(
    userId: string,
    familyId: string,
  ): Promise<RefreshTokenMaterial> {
    const jti = randomUUID();
    const refreshExpiresIn = this.configService.getOrThrow<string>('security.jwtRefreshExpiresIn');
    const token = await this.jwtService.signAsync(
      {
        jti,
        sub: userId,
        type: REFRESH_TOKEN_TYPE,
      } satisfies RefreshTokenPayload,
      {
        expiresIn: toDurationString(refreshExpiresIn),
        secret: this.configService.getOrThrow<string>('security.jwtRefreshSecret'),
      },
    );

    return {
      expiresAt: new Date(Date.now() + parseDurationToMilliseconds(refreshExpiresIn)),
      familyId,
      jti,
      token,
      tokenHash: hashToken(token),
      userId,
    };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<Record<string, unknown>>(refreshToken, {
        secret: this.configService.getOrThrow<string>('security.jwtRefreshSecret'),
      });

      if (!this.isRefreshTokenPayload(payload)) {
        throw new UnauthorizedException('Invalid refresh token.');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid refresh token.');
    }
  }

  private isRefreshTokenPayload(payload: unknown): payload is RefreshTokenPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const candidate = payload as Partial<RefreshTokenPayload>;

    return (
      typeof candidate.sub === 'string' &&
      typeof candidate.jti === 'string' &&
      candidate.type === REFRESH_TOKEN_TYPE
    );
  }
}
