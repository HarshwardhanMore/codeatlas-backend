import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { ListScansQueryDto } from '../dto/list-scans-query.dto';
import { ScannerService } from '../services/scanner.service';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type {
  ScanMutationResponse,
  PaginatedScanResponse,
  ScanResponse,
  ScanStatusResponse,
} from '../services/scanner.service';

@ApiTags('scanner')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller({
  path: '',
  version: '1',
})
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Post('repositories/:repositoryId/scans')
  @HttpCode(201)
  @ApiOkResponse({ description: 'Repository scan queued.' })
  startRepositoryScan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
  ): Promise<ScanMutationResponse> {
    return this.scannerService.startRepositoryScan(user, repositoryId);
  }

  @Get('repositories/:repositoryId/scans')
  @ApiOkResponse({ description: 'Repository scan history.' })
  listRepositoryScans(
    @CurrentUser() user: AuthenticatedUser,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Query() query: ListScansQueryDto,
  ): Promise<ScanResponse[] | PaginatedScanResponse> {
    return this.scannerService.listRepositoryScans(user, repositoryId, query);
  }

  @Get('scans/:scanId')
  @ApiOkResponse({ description: 'Repository scan details.' })
  getScan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scanId', ParseUUIDPipe) scanId: string,
  ): Promise<ScanMutationResponse> {
    return this.scannerService.getScan(user, scanId);
  }

  @Get('scans/:scanId/status')
  @ApiOkResponse({ description: 'Repository scan status and progress.' })
  getScanStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scanId', ParseUUIDPipe) scanId: string,
  ): Promise<ScanStatusResponse> {
    return this.scannerService.getScanStatus(user, scanId);
  }

  @Delete('scans/:scanId')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Repository scan cancelled.' })
  cancelScan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scanId', ParseUUIDPipe) scanId: string,
  ): Promise<ScanMutationResponse> {
    return this.scannerService.cancelScan(user, scanId);
  }
}
