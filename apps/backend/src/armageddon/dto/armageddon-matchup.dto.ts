import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ListRoundType, MatchupSide } from '@prisma/client';

export class GenerateArmageddonMatchupsDto {
  @IsEnum(ListRoundType)
  roundType: ListRoundType;

  @IsOptional()
  @IsInt()
  @Min(1)
  roundNumber?: number;
}

/** Um slot do chaveamento do 2º sorteio (arrasta-e-solta). */
export class SecondDrawSlotDto {
  @IsString()
  matchupId: string;

  @IsOptional()
  @IsString()
  leftDriverId?: string | null;

  @IsOptional()
  @IsString()
  rightDriverId?: string | null;
}

/** Persiste o posicionamento manual (DnD) da 1ª rodada do 2º sorteio. */
export class SaveSecondDrawLayoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SecondDrawSlotDto)
  slots: SecondDrawSlotDto[];
}

export class SettleArmageddonMatchupDto {
  @IsEnum(MatchupSide)
  winnerSide: MatchupSide;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
