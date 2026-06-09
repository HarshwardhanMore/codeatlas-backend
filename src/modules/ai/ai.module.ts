import { Module } from '@nestjs/common';

import { AiContextBuilderService } from './context/ai-context-builder.service';
import { AiController } from './controllers/ai.controller';
import { AI_PROVIDER } from './providers/ai-provider.token';
import { OpenRouterProvider } from './providers/open-router.provider';
import { AiConversationsRepository } from './repositories/ai-conversations.repository';
import { AiChatService } from './services/ai-chat.service';
import { AiRateLimitService } from './services/ai-rate-limit.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  controllers: [AiController],
  imports: [PrismaModule],
  providers: [
    AiChatService,
    AiContextBuilderService,
    AiConversationsRepository,
    AiRateLimitService,
    OpenRouterProvider,
    {
      provide: AI_PROVIDER,
      useExisting: OpenRouterProvider,
    },
  ],
})
export class AiModule {}
