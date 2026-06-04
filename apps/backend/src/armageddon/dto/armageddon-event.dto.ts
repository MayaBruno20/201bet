import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ArmageddonBracketType, ArmageddonStatus, ListFormat } from '@prisma/client';

export class CreateArmageddonEventDto {
  @IsString()
  @MaxLength(160)
  name: string;

  // LADDER (legado) ou ELIMINATION_144 (torneio 144→Top32→campeão + 3º lugar).
  @IsOptional()
  @IsEnum(ArmageddonBracketType)
  bracketType?: ArmageddonBracketType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string;

  // Link da transmissão ao vivo (YouTube) — embeddado no hub público.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  streamUrl?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsEnum(ListFormat)
  format?: ListFormat;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateArmageddonEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string;

  // Link da transmissão ao vivo (YouTube) — embeddado no hub público.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  streamUrl?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsEnum(ListFormat)
  format?: ListFormat;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(ArmageddonStatus)
  status?: ArmageddonStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
