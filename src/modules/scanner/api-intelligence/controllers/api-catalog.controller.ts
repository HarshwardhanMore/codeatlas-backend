import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { JwtGuard } from '../../../auth/guards/jwt.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { ListApiCatalogQueryDto } from '../dto/list-api-catalog-query.dto';
import { ListApiChangesQueryDto } from '../dto/list-api-changes-query.dto';
import { ApiCatalogService } from '../services/api-catalog.service';

import type { AuthenticatedUser } from '../../../../common/types/authenticated-user';
import type { OpenApiDocument } from '../openapi/openapi-generator.service';
import type {
  ApiChangeResponse,
  ApiDocumentationResponse,
  ApiSnapshotResponse,
  DetectedApiResponse,
  PaginatedResponse,
} from '../services/api-catalog.service';

@ApiTags('api-catalog')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller({
  path: '',
  version: '1',
})
export class ApiCatalogController {
  constructor(private readonly apiCatalogService: ApiCatalogService) {}

  @Get('repositories/:repositoryId/apis')
  @ApiOkResponse({ description: 'Detected repository APIs.' })
  listRepositoryApis(
    @CurrentUser() user: AuthenticatedUser,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Query() query: ListApiCatalogQueryDto,
  ): Promise<PaginatedResponse<DetectedApiResponse>> {
    return this.apiCatalogService.listRepositoryApis(user, repositoryId, query);
  }

  @Get('apis/:apiId')
  @ApiOkResponse({ description: 'Detected API details and generated documentation.' })
  getApi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('apiId', ParseUUIDPipe) apiId: string,
  ): Promise<ApiDocumentationResponse> {
    return this.apiCatalogService.getApi(user, apiId);
  }

  @Get('repositories/:repositoryId/openapi.json')
  @ApiOkResponse({ description: 'Repository OpenAPI specification.' })
  getRepositoryOpenApi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
  ): Promise<OpenApiDocument> {
    return this.apiCatalogService.getRepositoryOpenApi(user, repositoryId);
  }

  @Get('apis/:apiId/history')
  @ApiOkResponse({ description: 'Detected API immutable snapshot history.' })
  listApiHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('apiId', ParseUUIDPipe) apiId: string,
  ): Promise<ApiSnapshotResponse[]> {
    return this.apiCatalogService.listApiHistory(user, apiId);
  }

  @Get('apis/:apiId/changes')
  @ApiOkResponse({ description: 'Detected API change history.' })
  listApiChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('apiId', ParseUUIDPipe) apiId: string,
    @Query() query: ListApiChangesQueryDto,
  ): Promise<PaginatedResponse<ApiChangeResponse>> {
    return this.apiCatalogService.listApiChanges(user, apiId, query);
  }

  @Get('repositories/:repositoryId/changes')
  @ApiOkResponse({ description: 'Repository API change reports.' })
  listRepositoryChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Query() query: ListApiChangesQueryDto,
  ): Promise<PaginatedResponse<ApiChangeResponse>> {
    return this.apiCatalogService.listRepositoryChanges(user, repositoryId, query);
  }

  @Get('scans/:scanId/changes')
  @ApiOkResponse({ description: 'Scan API change report.' })
  listScanChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scanId', ParseUUIDPipe) scanId: string,
    @Query() query: ListApiChangesQueryDto,
  ): Promise<PaginatedResponse<ApiChangeResponse>> {
    return this.apiCatalogService.listScanChanges(user, scanId, query);
  }
}
