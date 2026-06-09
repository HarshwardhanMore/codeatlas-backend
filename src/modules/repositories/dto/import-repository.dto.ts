import { IsString, IsUUID, MaxLength } from 'class-validator';

export class ImportRepositoryDto {
  @IsUUID()
  connectionId!: string;

  @IsString()
  @MaxLength(320)
  externalId!: string;
}
