import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ListEventStatus } from '@prisma/client';

export class UpdateListEventDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsEnum(ListEventStatus)
  status?: ListEventStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
