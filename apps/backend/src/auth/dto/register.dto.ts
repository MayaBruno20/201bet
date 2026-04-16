import {
  IsDateString,
  IsEmail,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

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

  @IsString()
  @Matches(/^\d{11}$/, { message: 'CPF deve conter 11 dígitos numéricos' })
  cpf: string;

  @IsDateString()
  birthDate: string;
}
