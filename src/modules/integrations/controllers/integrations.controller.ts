import { Controller, Delete, Get, HttpCode, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { OAuthCallbackQueryDto } from '../dto/oauth-callback-query.dto';
import { RepositoryProviderParamDto } from '../dto/repository-provider-param.dto';
import { IntegrationsService } from '../services/integrations.service';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { ProviderRepositoryMetadata } from '../interfaces/git-provider.interface';
import type {
  AuthorizationUrlResponse,
  DisconnectProviderResponse,
  RepositoryConnectionResponse,
  RepositoryProviderStatusResponse,
} from '../services/integrations.service';
import type { Response } from 'express';

@ApiTags('integrations')
@Controller({
  path: 'integrations',
  version: '1',
})
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('connections')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @ApiOkResponse({ description: 'Repository provider connection list.' })
  listConnections(@CurrentUser() user: AuthenticatedUser): Promise<RepositoryConnectionResponse[]> {
    return this.integrationsService.listConnections(user);
  }

  @Get(':provider/status')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @ApiOkResponse({ description: 'Repository provider connection status.' })
  getProviderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: RepositoryProviderParamDto,
  ): Promise<RepositoryProviderStatusResponse> {
    return this.integrationsService.getProviderStatus(user, params.provider);
  }

  @Get(':provider/connect')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @ApiOkResponse({ description: 'Repository provider OAuth authorization URL.' })
  connectProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: RepositoryProviderParamDto,
  ): AuthorizationUrlResponse {
    return this.integrationsService.createAuthorizationUrl(user, params.provider);
  }

  @Get(':provider/callback')
  @ApiOkResponse({ description: 'Repository provider OAuth callback redirect.' })
  async providerCallback(
    @Param() params: RepositoryProviderParamDto,
    @Query() query: OAuthCallbackQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const redirectUrl = await this.integrationsService.handleOAuthCallback(params.provider, query);

    response.redirect(redirectUrl);
  }

  @Get(':provider/repositories')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @ApiOkResponse({ description: 'Repository list from a connected provider.' })
  listProviderRepositories(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: RepositoryProviderParamDto,
  ): Promise<ProviderRepositoryMetadata[]> {
    return this.integrationsService.listProviderRepositories(user, params.provider);
  }

  @Delete(':provider')
  @ApiBearerAuth()
  @HttpCode(200)
  @UseGuards(JwtGuard)
  @ApiOkResponse({ description: 'Disconnected repository provider.' })
  disconnectProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: RepositoryProviderParamDto,
  ): Promise<DisconnectProviderResponse> {
    return this.integrationsService.disconnectProvider(user, params.provider);
  }
}
