import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ListRoundType, MatchupSide } from '@prisma/client';

export class GenerateArmageddonMatchupsDto {
  @IsEnum(ListRoundType)
  roundType: ListRoundType;

  @IsOptional()
  @IsInt()
  @Min(1)
  roundNumber?: number;
}

export class SettleArmageddonMatchupDto {
  @IsEnum(MatchupSide)
  winnerSide: MatchupSide;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
