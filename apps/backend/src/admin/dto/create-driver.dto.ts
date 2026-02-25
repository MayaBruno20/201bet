import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  nickname?: string;
}
