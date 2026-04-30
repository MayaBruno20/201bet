import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { CategoryEventStatus } from '@prisma/client';

export class UpdateCategoryEventDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsDateString()
  scheduledAt?: string;

  @IsOptional() @IsDateString()
  endsAt?: string;

  @IsOptional() @IsEnum(CategoryEventStatus)
  status?: CategoryEventStatus;

  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048)
  bannerUrl?: string;

  @IsOptional() @IsBoolean()
  featured?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}
