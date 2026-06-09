import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import type { RefreshToken } from '@prisma/client';

export interface CreateRefreshTokenData {
  expiresAt: Date;
  familyId: string;
  jti: string;
  tokenHash: string;
  userId: string;
}

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRefreshTokenData): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
    });
  }

  async rotate(
    currentTokenId: string,
    nextToken: CreateRefreshTokenData,
  ): Promise<RefreshToken | null> {
    return this.prisma.$transaction(async (transaction) => {
      const revokedToken = await transaction.refreshToken.updateMany({
        data: {
          revokedAt: new Date(),
        },
        where: {
          id: currentTokenId,
          replacedByTokenId: null,
          revokedAt: null,
        },
      });

      if (revokedToken.count !== 1) {
        return null;
      }

      const createdToken = await transaction.refreshToken.create({
        data: nextToken,
      });

      await transaction.refreshToken.update({
        data: {
          replacedByTokenId: createdToken.id,
        },
        where: {
          id: currentTokenId,
        },
      });

      return createdToken;
    });
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      data: {
        revokedAt: new Date(),
      },
      where: {
        revokedAt: null,
        tokenHash,
      },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      data: {
        revokedAt: new Date(),
      },
      where: {
        familyId,
        revokedAt: null,
      },
    });
  }
}
