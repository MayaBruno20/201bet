import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { SharkTankStatus } from '@prisma/client';

export class CreateSharkTankEntryDto {
  @IsString()
  driverId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seed?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateSharkTankEntryDto {
  @IsOptional()
  @IsEnum(SharkTankStatus)
  status?: SharkTankStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  seed?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
