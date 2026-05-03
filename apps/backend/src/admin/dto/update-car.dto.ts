import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class UpdateCarDto {
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  category?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // string vazia ou null remove a foto; URL define manualmente. Upload binário usa o endpoint dedicado.
  @IsOptional()
  @IsString()
  photoUrl?: string | null;
}
