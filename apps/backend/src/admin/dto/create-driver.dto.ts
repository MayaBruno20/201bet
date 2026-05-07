import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  team?: string;

  @IsOptional()
  @IsString()
  carNumber?: string;

  @IsOptional()
  @IsString()
  hometown?: string;

  /** Piloto convidado (one-off / embate rápido). Default: false. */
  @IsOptional()
  @IsBoolean()
  isGuest?: boolean;
}
