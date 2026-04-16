import { DuelStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateDuelDto {
  @IsUUID()
  eventId: string;

  @IsUUID()
  leftCarId: string;

  @IsUUID()
  rightCarId: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  bookingCloseAt: string;

  @IsOptional()
  @IsEnum(DuelStatus)
  status?: DuelStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
