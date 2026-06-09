import { Injectable } from '@nestjs/common';
import { AuthProvider, UserStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const authorizationInclude = {
  userRoles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithAuthorization = Prisma.UserGetPayload<{
  include: typeof authorizationInclude;
}>;

export interface CreatePasswordUserData {
  email: string;
  name: string;
  passwordHash: string;
  roleId: string;
}

export interface GoogleUserData {
  email: string;
  name: string;
  avatar: string | null;
  providerId: string;
  roleId: string;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserWithAuthorization | null> {
    return this.prisma.user.findUnique({
      include: authorizationInclude,
      where: {
        email,
      },
    });
  }

  async findById(id: string): Promise<UserWithAuthorization | null> {
    return this.prisma.user.findUnique({
      include: authorizationInclude,
      where: {
        id,
      },
    });
  }

  async createPasswordUser(data: CreatePasswordUserData): Promise<UserWithAuthorization> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        status: UserStatus.ACTIVE,
        authAccounts: {
          create: {
            provider: AuthProvider.PASSWORD,
            providerId: data.email,
          },
        },
        userRoles: {
          create: {
            roleId: data.roleId,
          },
        },
      },
      include: authorizationInclude,
    });
  }

  async upsertGoogleUser(data: GoogleUserData): Promise<UserWithAuthorization> {
    return this.prisma.$transaction(async (transaction) => {
      const existingAccount = await transaction.authAccount.findUnique({
        include: {
          user: {
            include: authorizationInclude,
          },
        },
        where: {
          provider_providerId: {
            provider: AuthProvider.GOOGLE,
            providerId: data.providerId,
          },
        },
      });

      if (existingAccount) {
        return transaction.user.update({
          data: {
            avatar: data.avatar,
            name: data.name,
          },
          include: authorizationInclude,
          where: {
            id: existingAccount.userId,
          },
        });
      }

      const existingUser = await transaction.user.findUnique({
        include: authorizationInclude,
        where: {
          email: data.email,
        },
      });

      if (existingUser) {
        await transaction.authAccount.create({
          data: {
            provider: AuthProvider.GOOGLE,
            providerId: data.providerId,
            userId: existingUser.id,
          },
        });

        return transaction.user.update({
          data: {
            avatar: data.avatar,
            name: data.name,
          },
          include: authorizationInclude,
          where: {
            id: existingUser.id,
          },
        });
      }

      return transaction.user.create({
        data: {
          avatar: data.avatar,
          email: data.email,
          name: data.name,
          status: UserStatus.ACTIVE,
          authAccounts: {
            create: {
              provider: AuthProvider.GOOGLE,
              providerId: data.providerId,
            },
          },
          userRoles: {
            create: {
              roleId: data.roleId,
            },
          },
        },
        include: authorizationInclude,
      });
    });
  }
}
