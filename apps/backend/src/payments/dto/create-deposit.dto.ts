import { IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDepositDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(20, { message: 'Depósito mínimo de R$ 20,00' })
  @Max(1000, { message: 'Depósito máximo de R$ 1.000,00 por operação' })
  amount: number;
}
