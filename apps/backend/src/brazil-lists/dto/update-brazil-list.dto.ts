import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ListFormat } from '@prisma/client';

export class UpdateBrazilListDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(ListFormat)
  format?: ListFormat;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  administratorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hometown?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
