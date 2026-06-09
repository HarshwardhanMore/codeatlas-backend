import { ApiChangeSeverity, ApiChangeType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from './pagination-query.dto';

export class ListApiChangesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ApiChangeType)
  changeType?: ApiChangeType;

  @IsOptional()
  @IsEnum(ApiChangeSeverity)
  severity?: ApiChangeSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
