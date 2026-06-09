import { ApiFramework, ApiHttpMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from './pagination-query.dto';

export class ListApiCatalogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ApiFramework)
  framework?: ApiFramework;

  @IsOptional()
  @IsEnum(ApiHttpMethod)
  method?: ApiHttpMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
