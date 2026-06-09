import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AiChatDto } from '../dto/ai-chat.dto';
import { AiChatService } from '../services/ai-chat.service';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AiChatResponse, AiConversationResponse } from '../services/ai-chat.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller({
  path: 'ai',
  version: '1',
})
export class AiController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Post('repositories/:repositoryId/chat')
  @HttpCode(201)
  @ApiOkResponse({ description: 'AI repository assistant response.' })
  chat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Body() dto: AiChatDto,
  ): Promise<AiChatResponse> {
    return this.aiChatService.chat(user, repositoryId, dto);
  }

  @Get('conversations')
  @ApiOkResponse({ description: 'AI conversation history.' })
  listConversations(@CurrentUser() user: AuthenticatedUser): Promise<AiConversationResponse[]> {
    return this.aiChatService.listConversations(user);
  }

  @Get('conversations/:conversationId')
  @ApiOkResponse({ description: 'AI conversation details.' })
  getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<AiConversationResponse> {
    return this.aiChatService.getConversation(user, conversationId);
  }

  @Delete('conversations/:conversationId')
  @HttpCode(204)
  @ApiOkResponse({ description: 'AI conversation deleted.' })
  deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<void> {
    return this.aiChatService.deleteConversation(user, conversationId);
  }
}
