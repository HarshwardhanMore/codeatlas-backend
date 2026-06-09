import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { REFRESH_TOKEN_COOKIE_NAME } from '../auth.constants';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { GoogleGuard } from '../guards/google.guard';
import { JwtGuard } from '../guards/jwt.guard';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthService } from '../services/auth.service';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AuthResult, GoogleOAuthProfile, PublicAuthResult } from '../auth.types';
import type { Request, Response } from 'express';

interface RequestWithRefreshCookie extends Request {
  cookies: Partial<Record<typeof REFRESH_TOKEN_COOKIE_NAME, string>>;
}

interface GoogleOAuthRequest extends Request {
  user: GoogleOAuthProfile;
}

interface UserResponse {
  user: AuthenticatedUser;
}

interface LogoutResponse {
  success: true;
}

@ApiTags('auth')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(
    private readonly authCookieService: AuthCookieService,
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  @ApiOkResponse({ description: 'Registered user with access token.' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicAuthResult> {
    const result = await this.authService.register(dto);
    this.authCookieService.setRefreshTokenCookie(response, result.refreshToken);

    return this.toPublicAuthResult(result);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Authenticated user with access token.' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicAuthResult> {
    const result = await this.authService.login(dto);
    this.authCookieService.setRefreshTokenCookie(response, result.refreshToken);

    return this.toPublicAuthResult(result);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Rotated refresh token and issued a new access token.' })
  async refresh(
    @Req() request: RequestWithRefreshCookie,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicAuthResult> {
    const result = await this.authService.refresh(request.cookies[REFRESH_TOKEN_COOKIE_NAME] ?? '');
    this.authCookieService.setRefreshTokenCookie(response, result.refreshToken);

    return this.toPublicAuthResult(result);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Refresh token revoked and cookie cleared.' })
  async logout(
    @Req() request: RequestWithRefreshCookie,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponse> {
    await this.authService.logout(request.cookies[REFRESH_TOKEN_COOKIE_NAME]);
    this.authCookieService.clearRefreshTokenCookie(response);

    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @ApiOkResponse({ description: 'Current authenticated user.' })
  getMe(@CurrentUser() user: AuthenticatedUser): UserResponse {
    return { user };
  }

  @Get('google')
  @UseGuards(GoogleGuard)
  google(): void {
    return undefined;
  }

  @Get('google/callback')
  @UseGuards(GoogleGuard)
  async googleCallback(
    @Req() request: GoogleOAuthRequest,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.authService.authenticateGoogle(request.user);
    this.authCookieService.setRefreshTokenCookie(response, result.refreshToken);
    response.redirect(this.authCookieService.getGoogleSuccessRedirectUrl());
  }

  private toPublicAuthResult(result: AuthResult): PublicAuthResult {
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }
}
