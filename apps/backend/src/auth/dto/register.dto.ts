import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { IsCPF } from '../../common/validators/cpf.validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(8)
  confirmPassword: string;

  // CPF e birthDate sao opcionais no signup; obrigatorios via /complete-profile
  // antes de depositar/sacar/apostar (gated em profileComplete)
  @IsOptional()
  @IsString()
  @IsCPF()
  cpf?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  // Código da campanha promocional (QR Code do panfleto). Capturado de
  // /login?promo=<code>. Se bater com uma campanha ativa, inscreve o usuário.
  @IsOptional()
  @IsString()
  @MinLength(1)
  promoCode?: string;
}
