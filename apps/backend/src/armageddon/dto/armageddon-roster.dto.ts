import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportListPilotsItemDto {
  @IsString()
  listId: string;

  @IsInt()
  @Min(1)
  @Max(20)
  count: number;
}

export class ImportRosterFromListsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ImportListPilotsItemDto)
  selections: ImportListPilotsItemDto[];

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}

export class UpsertArmageddonRosterDto {
  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  driverName?: string;

  @IsInt()
  @Min(1)
  @Max(20)
  position: number;

  @IsOptional()
  @IsBoolean()
  isKing?: boolean;

  @IsOptional()
  @IsString()
  fromListId?: string;

  @IsOptional()
  @IsInt()
  fromAreaCode?: number;

  @IsOptional()
  @IsInt()
  fromPosition?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
