import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { ImportRepositoryDto } from '../dto/import-repository.dto';
import { ListRepositoriesQueryDto } from '../dto/list-repositories-query.dto';
import { ABSOLUTE_ZIP_UPLOAD_LIMIT_BYTES, ZIP_UPLOAD_FIELD_NAME } from '../repositories.constants';
import { RepositoriesService } from '../services/repositories.service';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type {
  PaginatedRepositoryResponse,
  RepositoryMutationResponse,
  RepositoryResponse,
} from '../services/repositories.service';

@ApiTags('repositories')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller({
  path: 'repositories',
  version: '1',
})
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @Get()
  @ApiOkResponse({ description: 'Selected repository sources.' })
  listRepositories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRepositoriesQueryDto,
  ): Promise<RepositoryResponse[] | PaginatedRepositoryResponse> {
    return this.repositoriesService.listRepositories(user, query);
  }

  @Post('import')
  @HttpCode(201)
  @ApiOkResponse({ description: 'Selected repository metadata saved.' })
  importRepository(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportRepositoryDto,
  ): Promise<RepositoryMutationResponse> {
    return this.repositoriesService.importRepository(user, dto);
  }

  @Post('upload-zip')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor(ZIP_UPLOAD_FIELD_NAME, {
      limits: {
        fileSize: ABSOLUTE_ZIP_UPLOAD_LIMIT_BYTES,
      },
      storage: memoryStorage(),
    }),
  )
  @ApiOkResponse({ description: 'ZIP repository metadata saved.' })
  uploadZipRepository(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<RepositoryMutationResponse> {
    return this.repositoriesService.uploadZipRepository(user, file);
  }
}
