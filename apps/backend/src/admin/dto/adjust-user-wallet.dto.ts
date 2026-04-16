import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum WalletAdjustOperation {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
}

export class AdjustUserWalletDto {
  @IsEnum(WalletAdjustOperation)
  operation: WalletAdjustOperation;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reason?: string;
}
