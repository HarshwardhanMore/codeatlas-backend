import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

import { AuthService } from './auth.service';

import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { UserWithAuthorization } from '../../users/repositories/users.repository';
import type { CreatePasswordUserInput, UsersService } from '../../users/services/users.service';

const createdAt = new Date('2026-01-01T00:00:00.000Z');

const authenticatedUser: AuthenticatedUser = {
  avatar: null,
  email: 'engineer@example.com',
  id: 'user-id',
  name: 'Engineer',
  permissions: [],
  roles: ['USER'],
  status: UserStatus.ACTIVE,
};

const userRecord: UserWithAuthorization = {
  avatar: null,
  createdAt,
  email: authenticatedUser.email,
  id: authenticatedUser.id,
  name: authenticatedUser.name,
  passwordHash: 'stored-password-hash',
  status: UserStatus.ACTIVE,
  updatedAt: createdAt,
  userRoles: [],
};

interface AuthServiceTestContext {
  authService: AuthService;
  passwordService: jest.Mocked<Pick<PasswordService, 'hashPassword' | 'verifyPassword'>>;
  tokenService: jest.Mocked<Pick<TokenService, 'issueAccessToken' | 'issueRefreshToken'>>;
  usersService: jest.Mocked<
    Pick<
      UsersService,
      'createPasswordUser' | 'findByEmail' | 'normalizeEmail' | 'toAuthenticatedUser'
    >
  >;
}

function createAuthService(): AuthServiceTestContext {
  const passwordService: AuthServiceTestContext['passwordService'] = {
    hashPassword: jest.fn<Promise<string>, [string]>((password) => {
      void password;
      return Promise.resolve('new-password-hash');
    }),
    verifyPassword: jest.fn<Promise<boolean>, [string, string]>((password, passwordHash) => {
      void password;
      void passwordHash;
      return Promise.resolve(false);
    }),
  };
  const tokenService: AuthServiceTestContext['tokenService'] = {
    issueAccessToken: jest.fn<Promise<string>, [AuthenticatedUser]>((user) => {
      void user;
      return Promise.resolve('access-token');
    }),
    issueRefreshToken: jest.fn<Promise<string>, [string]>((userId) => {
      void userId;
      return Promise.resolve('refresh-token');
    }),
  };
  const usersService: AuthServiceTestContext['usersService'] = {
    createPasswordUser: jest.fn<Promise<AuthenticatedUser>, [CreatePasswordUserInput]>((input) => {
      void input;
      return Promise.resolve(authenticatedUser);
    }),
    findByEmail: jest.fn<Promise<UserWithAuthorization | null>, [string]>((email) => {
      void email;
      return Promise.resolve(null);
    }),
    normalizeEmail: jest.fn((email: string): string => email.trim().toLowerCase()),
    toAuthenticatedUser: jest.fn<AuthenticatedUser, [UserWithAuthorization]>((user) => {
      void user;
      return authenticatedUser;
    }),
  };

  return {
    authService: new AuthService(
      passwordService,
      tokenService as unknown as TokenService,
      usersService as unknown as UsersService,
    ),
    passwordService,
    tokenService,
    usersService,
  };
}

describe(AuthService.name, () => {
  it('registers a password user and returns public tokens', async () => {
    const context = createAuthService();

    await expect(
      context.authService.register({
        email: ' Engineer@Example.com ',
        name: 'Engineer',
        password: 'secure-password-value',
      }),
    ).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: authenticatedUser,
    });

    expect(context.usersService.createPasswordUser).toHaveBeenCalledWith({
      email: authenticatedUser.email,
      name: authenticatedUser.name,
      passwordHash: 'new-password-hash',
    });
  });

  it('rejects registration for an existing email', async () => {
    const context = createAuthService();
    jest.mocked(context.usersService.findByEmail).mockResolvedValue(userRecord);

    await expect(
      context.authService.register({
        email: authenticatedUser.email,
        password: 'secure-password-value',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects login when the password is invalid', async () => {
    const context = createAuthService();
    jest.mocked(context.usersService.findByEmail).mockResolvedValue(userRecord);
    jest.mocked(context.passwordService.verifyPassword).mockResolvedValue(false);

    await expect(
      context.authService.login({
        email: authenticatedUser.email,
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
