import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export enum PixKeyType {
  DOCUMENT = 'document',
  PHONE = 'phone',
  EMAIL = 'email',
  EVP = 'evp',
}

export class CreateWithdrawDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(20, { message: 'Saque mínimo de R$ 20,00' })
  amount: number;

  @IsEnum(PixKeyType, { message: 'Tipo de chave PIX inválido' })
  pixKeyType: PixKeyType;

  @IsString()
  @MinLength(1, { message: 'Chave PIX é obrigatória' })
  pixKey: string;
}
