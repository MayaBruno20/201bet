import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TimeCategory } from '@prisma/client';

export class ImportCompetitorEntryDto {
  @IsEnum(TimeCategory)
  category: TimeCategory;

  @IsString()
  @MaxLength(120)
  driverName: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  driverNickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  carName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  carNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  driverTeam?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  driverHometown?: string;

  @IsOptional()
  @IsNumber()
  qualifyingReaction?: number;

  @IsOptional()
  @IsNumber()
  qualifyingTrack?: number;
}

export class ImportCompetitorsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportCompetitorEntryDto)
  entries: ImportCompetitorEntryDto[];
}
