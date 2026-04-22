import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateListEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
