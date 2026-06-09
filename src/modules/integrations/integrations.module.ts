import { Module } from '@nestjs/common';

import { IntegrationsController } from './controllers/integrations.controller';
import { BitbucketProvider } from './providers/bitbucket.provider';
import { GitProviderRegistry } from './providers/git-provider-registry.service';
import { GithubProvider } from './providers/github.provider';
import { RepositoryConnectionsRepository } from './repositories/repository-connections.repository';
import { IntegrationsService } from './services/integrations.service';
import { OAuthStateService } from './services/oauth-state.service';
import { OAuthTokenEncryptionService } from './services/oauth-token-encryption.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  controllers: [IntegrationsController],
  exports: [IntegrationsService, RepositoryConnectionsRepository],
  imports: [PrismaModule],
  providers: [
    BitbucketProvider,
    GithubProvider,
    GitProviderRegistry,
    IntegrationsService,
    OAuthStateService,
    OAuthTokenEncryptionService,
    RepositoryConnectionsRepository,
  ],
})
export class IntegrationsModule {}
