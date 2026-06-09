import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RolesRepository } from './repositories/roles.repository';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './services/users.service';

@Module({
  exports: [UsersService],
  imports: [PrismaModule],
  providers: [RolesRepository, UsersRepository, UsersService],
})
export class UsersModule {}
