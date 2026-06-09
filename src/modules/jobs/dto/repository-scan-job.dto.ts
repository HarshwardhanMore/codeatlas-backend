import { IsString, IsUUID } from 'class-validator';

export class RepositoryScanJobDto {
  @IsUUID()
  repositoryId!: string;

  @IsUUID()
  scanId!: string;

  @IsString()
  userId!: string;
}
