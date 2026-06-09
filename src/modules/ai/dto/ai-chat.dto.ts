import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AiChatDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  question!: string;
}
