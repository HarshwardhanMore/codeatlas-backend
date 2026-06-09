import { Module } from '@nestjs/common';

import { IntegrationsModule } from '../integrations/integrations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RepositoriesController } from './controllers/repositories.controller';
import { RepositoriesRepository } from './repositories/repositories.repository';
import { RepositoriesService } from './services/repositories.service';
import { ZipRepositoryStorageService } from './services/zip-repository-storage.service';

@Module({
  controllers: [RepositoriesController],
  imports: [IntegrationsModule, PrismaModule],
  providers: [RepositoriesRepository, RepositoriesService, ZipRepositoryStorageService],
})
export class RepositoriesModule {}
