import type { ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE } from './auth.constants';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { RefreshToken } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  type: typeof ACCESS_TOKEN_TYPE;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: typeof REFRESH_TOKEN_TYPE;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

export interface PublicAuthResult {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface GoogleOAuthProfile {
  email: string;
  name: string;
  avatar: string | null;
  providerId: string;
}

export type StoredRefreshToken = RefreshToken;
