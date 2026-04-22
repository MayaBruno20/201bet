import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertRosterEntryDto {
  @IsInt()
  @Min(1)
  @Max(20)
  position: number;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  driverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  driverNickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  driverCarNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  driverTeam?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  driverHometown?: string;

  @IsOptional()
  @IsBoolean()
  isKing?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
