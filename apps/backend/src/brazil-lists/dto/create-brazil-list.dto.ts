import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ListFormat } from '@prisma/client';

export class CreateBrazilListDto {
  @IsInt()
  @Min(10)
  @Max(99)
  areaCode: number;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEnum(ListFormat)
  format: ListFormat;

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
