import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { ListEventStatus } from '@prisma/client';

export class UpdateListEventDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(ListEventStatus)
  status?: ListEventStatus;

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
