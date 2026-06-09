import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardRepository } from './repositories/dashboard.repository';
import { DashboardService } from './services/dashboard.service';

@Module({
  controllers: [DashboardController],
  imports: [PrismaModule],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
