import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCarDto {
  @IsUUID()
  driverId: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  category: string;

  @IsOptional()
  @IsString()
  number?: string;
}
