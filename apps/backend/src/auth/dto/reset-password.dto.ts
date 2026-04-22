import { IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString({ message: 'Token inválido' })
  @Length(20, 512, { message: 'Token inválido' })
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Nova senha deve ter ao menos 8 caracteres' })
  newPassword!: string;

  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}
