import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';

import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { UsersService } from '../../users/services/users.service';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AuthResult, GoogleOAuthProfile, PublicAuthResult } from '../auth.types';
import type { LoginDto } from '../dto/login.dto';
import type { RegisterDto } from '../dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const normalizedEmail = this.usersService.normalizeEmail(dto.email);
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const user = await this.usersService.createPasswordUser({
      email: normalizedEmail,
      name: this.resolveDisplayName(dto.name, normalizedEmail),
      passwordHash,
    });

    return this.issueAuthResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const userRecord = await this.usersService.findByEmail(dto.email);

    if (!userRecord?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    this.assertActiveUser(this.usersService.toAuthenticatedUser(userRecord));

    const isPasswordValid = await this.passwordService.verifyPassword(
      dto.password,
      userRecord.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.issueAuthResult(this.usersService.toAuthenticatedUser(userRecord));
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const storedToken = await this.tokenService.validateRefreshToken(refreshToken);
    const user = await this.usersService.findAuthenticatedUserById(storedToken.userId);

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    this.assertActiveUser(user);

    const nextRefreshToken = await this.tokenService.rotateRefreshToken(storedToken);
    const accessToken = await this.tokenService.issueAccessToken(user);

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      user,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    await this.tokenService.revokeRefreshToken(refreshToken);
  }

  async getPublicAuthResult(user: AuthenticatedUser): Promise<PublicAuthResult> {
    this.assertActiveUser(user);

    return {
      accessToken: await this.tokenService.issueAccessToken(user),
      user,
    };
  }

  async authenticateGoogle(profile: GoogleOAuthProfile): Promise<AuthResult> {
    const user = await this.usersService.findOrCreateGoogleUser({
      avatar: profile.avatar,
      email: profile.email,
      name: profile.name,
      providerId: profile.providerId,
    });

    this.assertActiveUser(user);

    return this.issueAuthResult(user);
  }

  private async issueAuthResult(user: AuthenticatedUser): Promise<AuthResult> {
    this.assertActiveUser(user);

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.issueAccessToken(user),
      this.tokenService.issueRefreshToken(user.id),
    ]);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  private assertActiveUser(user: AuthenticatedUser): void {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is not active.');
    }
  }

  private resolveDisplayName(name: string | undefined, email: string): string {
    const trimmedName = name?.trim();

    if (trimmedName) {
      return trimmedName;
    }

    const [localPart] = email.split('@');

    return localPart && localPart.length > 0 ? localPart : email;
  }
}
