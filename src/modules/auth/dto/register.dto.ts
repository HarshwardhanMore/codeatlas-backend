import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'engineer@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @Length(12, 128)
  password!: string;
}
