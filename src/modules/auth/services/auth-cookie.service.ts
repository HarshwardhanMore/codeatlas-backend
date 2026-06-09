import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { parseDurationToMilliseconds } from '../../../common/utils/duration.util';
import {
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  GOOGLE_OAUTH_STATE_TTL_MS,
  GOOGLE_OAUTH_SUCCESS_PATH,
  REFRESH_TOKEN_COOKIE_NAME,
} from '../auth.constants';

import type { CookieOptions, Response } from 'express';

@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService) {}

  setRefreshTokenCookie(response: Response, refreshToken: string): void {
    response.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      ...this.getBaseCookieOptions(),
      maxAge: parseDurationToMilliseconds(
        this.configService.getOrThrow<string>('security.jwtRefreshExpiresIn'),
      ),
    });
  }

  clearRefreshTokenCookie(response: Response): void {
    response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.getBaseCookieOptions());
  }

  setGoogleOAuthStateCookie(response: Response, state: string): void {
    response.cookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, state, {
      ...this.getBaseCookieOptions(),
      maxAge: GOOGLE_OAUTH_STATE_TTL_MS,
      path: '/api/v1/auth/google/callback',
    });
  }

  clearGoogleOAuthStateCookie(response: Response): void {
    response.clearCookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, {
      ...this.getBaseCookieOptions(),
      path: '/api/v1/auth/google/callback',
    });
  }

  getGoogleSuccessRedirectUrl(): string {
    const frontendOrigin = this.configService.getOrThrow<string>('app.frontendOrigin');

    return new URL(GOOGLE_OAUTH_SUCCESS_PATH, frontendOrigin).toString();
  }

  private getBaseCookieOptions(): CookieOptions {
    const isProduction = this.configService.getOrThrow<string>('app.environment') === 'production';

    return {
      httpOnly: true,
      path: '/api/v1/auth',
      sameSite: 'lax',
      secure: isProduction,
    };
  }
}
