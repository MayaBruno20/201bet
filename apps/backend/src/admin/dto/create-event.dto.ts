import { EventStatus, MarketStatus, OddStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class CreateOddDto {
  @IsString()
  @MinLength(1)
  label: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  value: number;

  @IsOptional()
  @IsEnum(OddStatus)
  status?: OddStatus;
}

class CreateMarketDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsEnum(MarketStatus)
  status?: MarketStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOddDto)
  odds: CreateOddDto[];
}

export class CreateEventDto {
  @IsString()
  @MinLength(2)
  sport: string;

  @IsString()
  @MinLength(3)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  bannerUrl?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsDateString()
  startAt: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMarketDto)
  markets: CreateMarketDto[];
}
