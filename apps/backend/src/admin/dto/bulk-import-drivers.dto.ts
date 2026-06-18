import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkImportDriverItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  // Apelido do piloto → grava em Driver.nickname.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nickname?: string;

  // Área/lista de origem (DDD "11"/"41" ou sigla "ARG"/"PAR"). Apenas informativo
  // no import — fica registrado na auditoria; a vinculação à chave é feita depois.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  area?: string;
}

export class BulkImportDriversDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => BulkImportDriverItemDto)
  pilots: BulkImportDriverItemDto[];
}
