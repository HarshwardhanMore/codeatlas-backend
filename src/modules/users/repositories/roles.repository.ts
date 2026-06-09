import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_USER_ROLE, DEFAULT_USER_ROLE_DESCRIPTION } from '../users.constants';

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultUserRole(): Promise<string> {
    const role = await this.prisma.role.upsert({
      create: {
        description: DEFAULT_USER_ROLE_DESCRIPTION,
        name: DEFAULT_USER_ROLE,
      },
      update: {},
      where: {
        name: DEFAULT_USER_ROLE,
      },
    });

    return role.id;
  }
}
