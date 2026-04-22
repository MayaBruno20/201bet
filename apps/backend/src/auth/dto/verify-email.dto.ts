import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsString({ message: 'Token inválido' })
  @Length(20, 512, { message: 'Token inválido' })
  token!: string;
}
