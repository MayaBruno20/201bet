import { DuelStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateDuelDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  leftCarId?: string;

  @IsOptional()
  @IsUUID()
  rightCarId?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  bookingCloseAt?: string;

  @IsOptional()
  @IsEnum(DuelStatus)
  status?: DuelStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
