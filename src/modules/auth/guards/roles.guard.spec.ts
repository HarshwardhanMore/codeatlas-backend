import { UserStatus } from '@prisma/client';

import { RolesGuard } from './roles.guard';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

const user: AuthenticatedUser = {
  avatar: null,
  email: 'engineer@example.com',
  id: 'user-id',
  name: 'Engineer',
  permissions: [],
  roles: ['ADMIN'],
  status: UserStatus.ACTIVE,
};

function createExecutionContext(): ExecutionContext {
  return {
    getArgByIndex: jest.fn(),
    getArgs: jest.fn(),
    getClass: jest.fn(),
    getHandler: jest.fn(),
    getType: jest.fn(),
    switchToHttp: jest.fn(() => ({
      getNext: jest.fn(),
      getRequest: jest.fn(() => ({ user })),
      getResponse: jest.fn(),
    })),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
  } as ExecutionContext;
}

describe(RolesGuard.name, () => {
  it('allows a user with one of the required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn((): string[] => ['ADMIN']),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(createExecutionContext())).toBe(true);
  });

  it('denies a user without the required role', () => {
    const reflector = {
      getAllAndOverride: jest.fn((): string[] => ['OWNER']),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(createExecutionContext())).toBe(false);
  });
});
