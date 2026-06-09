import { Transform, type TransformFnParams } from 'class-transformer';
import { IsIn } from 'class-validator';

import {
  OAUTH_REPOSITORY_PROVIDERS,
  type OAuthRepositoryProvider,
} from '../integrations.constants';

export class RepositoryProviderParamDto {
  @Transform(({ value }: TransformFnParams): string => String(value).trim().toUpperCase())
  @IsIn(OAUTH_REPOSITORY_PROVIDERS)
  provider!: OAuthRepositoryProvider;
}
