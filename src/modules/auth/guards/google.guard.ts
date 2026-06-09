import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard, type IAuthModuleOptions } from '@nestjs/passport';

import { GOOGLE_OAUTH_STATE_COOKIE_NAME } from '../auth.constants';
import { AuthCookieService } from '../services/auth-cookie.service';
import { GoogleOAuthStateService } from '../services/google-oauth-state.service';

import type { Request, Response } from 'express';

interface GoogleOAuthRequest extends Request {
  cookies: Partial<Record<typeof GOOGLE_OAUTH_STATE_COOKIE_NAME, string>>;
  googleOAuthState?: string;
}

@Injectable()
export class GoogleGuard extends AuthGuard('google') {
  constructor(
    private readonly authCookieService: AuthCookieService,
    private readonly googleOAuthStateService: GoogleOAuthStateService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = this.getRequest(context);
    const response = context.switchToHttp().getResponse<Response>();

    if (this.isGoogleCallback(request)) {
      await this.googleOAuthStateService.consumeState(
        this.getQueryValue(request.query['state']),
        request.cookies[GOOGLE_OAUTH_STATE_COOKIE_NAME],
      );
      this.authCookieService.clearGoogleOAuthStateCookie(response);

      return Boolean(await super.canActivate(context));
    }

    const state = await this.googleOAuthStateService.createState();
    request.googleOAuthState = state;
    this.authCookieService.setGoogleOAuthStateCookie(response, state);

    return Boolean(await super.canActivate(context));
  }

  override getAuthenticateOptions(context: ExecutionContext): IAuthModuleOptions | undefined {
    const request = this.getRequest(context);

    if (!request.googleOAuthState) {
      return undefined;
    }

    return {
      state: request.googleOAuthState,
    };
  }

  override getRequest(context: ExecutionContext): GoogleOAuthRequest {
    return context.switchToHttp().getRequest<GoogleOAuthRequest>();
  }

  private isGoogleCallback(request: GoogleOAuthRequest): boolean {
    return request.path.endsWith('/google/callback') || request.url.includes('/google/callback');
  }

  private getQueryValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
