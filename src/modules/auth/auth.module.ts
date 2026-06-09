import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './controllers/auth.controller';
import { GoogleGuard } from './guards/google.guard';
import { RolesGuard } from './guards/roles.guard';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import { AuthCookieService } from './services/auth-cookie.service';
import { AuthService } from './services/auth.service';
import { GoogleOAuthStateService } from './services/google-oauth-state.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  controllers: [AuthController],
  exports: [JwtModule, RolesGuard],
  imports: [JwtModule.register({}), PassportModule, PrismaModule, UsersModule],
  providers: [
    AuthCookieService,
    AuthService,
    GoogleGuard,
    GoogleOAuthStateService,
    GoogleStrategy,
    JwtStrategy,
    PasswordService,
    RefreshTokensRepository,
    RolesGuard,
    TokenService,
  ],
})
export class AuthModule {}
