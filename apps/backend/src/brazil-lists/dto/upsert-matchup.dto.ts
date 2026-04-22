import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ListRoundType, MatchupSide } from '@prisma/client';

export class UpsertMatchupDto {
  @IsInt()
  @Min(1)
  roundNumber: number;

  @IsEnum(ListRoundType)
  roundType: ListRoundType;

  @IsInt()
  @Min(1)
  order: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  leftPosition?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  rightPosition?: number;

  @IsOptional()
  @IsString()
  leftDriverId?: string;

  @IsOptional()
  @IsString()
  rightDriverId?: string;

  @IsOptional()
  @IsEnum(MatchupSide)
  winnerSide?: MatchupSide;

  @IsOptional()
  @IsBoolean()
  isManualOverride?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateMatchupDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  leftPosition?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  rightPosition?: number;

  @IsOptional()
  @IsString()
  leftDriverId?: string;

  @IsOptional()
  @IsString()
  rightDriverId?: string;

  @IsOptional()
  @IsEnum(MatchupSide)
  winnerSide?: MatchupSide;

  @IsOptional()
  @IsBoolean()
  isManualOverride?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SettleMatchupDto {
  @IsEnum(MatchupSide)
  winnerSide: MatchupSide;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
