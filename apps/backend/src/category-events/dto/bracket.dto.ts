import { IsEnum, IsInt, IsOptional, IsString, IsUUID, IsArray, ValidateNested, IsBoolean, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { TimeCategory, MatchupSide, CategoryMatchupStatus } from '@prisma/client';

export class CreateBracketDto {
  @IsEnum(TimeCategory)
  category: TimeCategory;

  @IsOptional() @IsInt() @Min(2) @Max(64)
  size?: number;
}

export class UpsertCompetitorDto {
  @IsOptional() @IsUUID()
  driverId?: string;

  @IsOptional() @IsString() @MaxLength(120)
  driverName?: string;

  @IsOptional() @IsString() @MaxLength(60)
  driverNickname?: string;

  @IsOptional() @IsString() @MaxLength(120)
  carName?: string;

  @IsOptional() @IsString() @MaxLength(20)
  carNumber?: string;

  @IsOptional() @IsString() @MaxLength(120)
  driverHometown?: string;

  @IsOptional() @IsString() @MaxLength(120)
  driverTeam?: string;

  @IsOptional() @IsNumber()
  qualifyingReaction?: number;

  @IsOptional() @IsNumber()
  qualifyingTrack?: number;

  @IsOptional() @IsInt() @Min(1)
  qualifyingPosition?: number;
}

export class UpdateCompetitorDto {
  @IsOptional() @IsString() @MaxLength(120)
  carName?: string;

  @IsOptional() @IsString() @MaxLength(20)
  carNumber?: string;

  @IsOptional() @IsNumber()
  qualifyingReaction?: number;

  @IsOptional() @IsNumber()
  qualifyingTrack?: number;

  @IsOptional() @IsInt() @Min(1)
  qualifyingPosition?: number;
}

class BracketSlotDto {
  @IsInt() @Min(1)
  roundNumber: number;

  @IsInt() @Min(0)
  position: number;

  @IsOptional() @IsUUID()
  leftCompetitorId?: string;

  @IsOptional() @IsUUID()
  rightCompetitorId?: string;
}

export class SaveBracketLayoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BracketSlotDto)
  slots: BracketSlotDto[];
}

export class SettleCategoryMatchupDto {
  @IsEnum(MatchupSide)
  winnerSide: MatchupSide;

  @IsOptional() @IsNumber() leftReaction?: number;
  @IsOptional() @IsNumber() leftTrack?: number;
  @IsOptional() @IsBoolean() leftQueimou?: boolean;
  @IsOptional() @IsBoolean() leftInvalid?: boolean;

  @IsOptional() @IsNumber() rightReaction?: number;
  @IsOptional() @IsNumber() rightTrack?: number;
  @IsOptional() @IsBoolean() rightQueimou?: boolean;
  @IsOptional() @IsBoolean() rightInvalid?: boolean;

  @IsOptional() @IsEnum(CategoryMatchupStatus)
  status?: CategoryMatchupStatus;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}
