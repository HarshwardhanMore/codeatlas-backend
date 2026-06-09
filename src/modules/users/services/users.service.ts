import { Injectable } from '@nestjs/common';

import { RolesRepository } from '../repositories/roles.repository';
import { UsersRepository, type UserWithAuthorization } from '../repositories/users.repository';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';

export interface CreatePasswordUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

export interface GoogleIdentityInput {
  email: string;
  name: string;
  avatar: string | null;
  providerId: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async findByEmail(email: string): Promise<UserWithAuthorization | null> {
    return this.usersRepository.findByEmail(this.normalizeEmail(email));
  }

  async findAuthenticatedUserById(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      return null;
    }

    return this.toAuthenticatedUser(user);
  }

  async createPasswordUser(input: CreatePasswordUserInput): Promise<AuthenticatedUser> {
    const roleId = await this.rolesRepository.ensureDefaultUserRole();
    const user = await this.usersRepository.createPasswordUser({
      email: this.normalizeEmail(input.email),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      roleId,
    });

    return this.toAuthenticatedUser(user);
  }

  async findOrCreateGoogleUser(input: GoogleIdentityInput): Promise<AuthenticatedUser> {
    const roleId = await this.rolesRepository.ensureDefaultUserRole();
    const user = await this.usersRepository.upsertGoogleUser({
      avatar: input.avatar,
      email: this.normalizeEmail(input.email),
      name: input.name.trim(),
      providerId: input.providerId,
      roleId,
    });

    return this.toAuthenticatedUser(user);
  }

  toAuthenticatedUser(user: UserWithAuthorization): AuthenticatedUser {
    const roleNames = user.userRoles.map((userRole) => userRole.role.name);
    const permissions = user.userRoles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission.action),
    );

    return {
      avatar: user.avatar,
      email: user.email,
      id: user.id,
      name: user.name,
      permissions: [...new Set(permissions)],
      roles: [...new Set(roleNames)],
      status: user.status,
    };
  }
}
