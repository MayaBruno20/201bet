import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ListRoundType } from '@prisma/client';

export class GenerateMatchupsDto {
  @IsEnum(ListRoundType)
  roundType: ListRoundType;

  @IsOptional()
  @IsInt()
  @Min(1)
  roundNumber?: number;
}
