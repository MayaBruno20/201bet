import { IsString, Matches } from 'class-validator';

/** Conclusão de cadastro após login com Google (CPF + maioridade). */
export class CompleteProfileDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: 'CPF deve conter 11 dígitos numéricos' })
  cpf!: string;

  /** ISO (YYYY-MM-DD) */
  @IsString()
  birthDate!: string;
}
