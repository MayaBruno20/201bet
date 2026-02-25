import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertSettingDto {
  @IsString()
  @MinLength(2)
  key: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  description?: string;
}
