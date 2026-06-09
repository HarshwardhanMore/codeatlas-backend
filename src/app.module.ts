import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configuration } from './config/configuration';
import { validateEnvironment } from './config/env.schema';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { RepositoriesModule } from './modules/repositories/repositories.module';
import { ScannerModule } from './modules/scanner/scanner.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnvironment,
    }),
    AiModule,
    AuthModule,
    DashboardModule,
    HealthModule,
    IntegrationsModule,
    JobsModule,
    RepositoriesModule,
    ScannerModule,
  ],
})
export class AppModule {}
