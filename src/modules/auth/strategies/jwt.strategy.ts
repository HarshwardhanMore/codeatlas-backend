import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UsersService } from '../../users/services/users.service';
import { ACCESS_TOKEN_TYPE } from '../auth.constants';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AccessTokenPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('security.jwtAccessSecret'),
    });
  }

  async validate(payload: unknown): Promise<AuthenticatedUser> {
    if (!this.isAccessTokenPayload(payload)) {
      throw new UnauthorizedException('Invalid access token.');
    }

    const user = await this.usersService.findAuthenticatedUserById(payload.sub);

    if (user?.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid access token.');
    }

    return user;
  }

  private isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const candidate = payload as Partial<AccessTokenPayload>;

    return (
      typeof candidate.sub === 'string' &&
      typeof candidate.email === 'string' &&
      Array.isArray(candidate.roles) &&
      Array.isArray(candidate.permissions) &&
      candidate.type === ACCESS_TOKEN_TYPE
    );
  }
}
