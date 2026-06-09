import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { DependencyGraphService } from './dependency-graph.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtGuard } from '../../auth/guards/jwt.guard';

import type { DependencyGraphResponse } from './dependency-graph.service';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';

@ApiTags('dependency-graph')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller({
  path: '',
  version: '1',
})
export class DependencyGraphController {
  constructor(private readonly dependencyGraphService: DependencyGraphService) {}

  @Get('repositories/:repositoryId/dependencies')
  @ApiOkResponse({ description: 'Repository code dependency graph.' })
  getRepositoryDependencyGraph(
    @CurrentUser() user: AuthenticatedUser,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
  ): Promise<DependencyGraphResponse> {
    return this.dependencyGraphService.getRepositoryDependencyGraph(user, repositoryId);
  }
}
