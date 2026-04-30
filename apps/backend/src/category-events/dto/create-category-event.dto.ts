import { IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { TimeCategory } from '@prisma/client';

export class CreateCategoryEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(TimeCategory, { each: true })
  categories?: TimeCategory[];

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  bannerUrl?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
