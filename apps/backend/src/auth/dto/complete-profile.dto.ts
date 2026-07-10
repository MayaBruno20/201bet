import { IsString } from 'class-validator';
import { IsCPF } from '../../common/validators/cpf.validator';

/** Conclusão de cadastro após login com Google (CPF + maioridade). */
export class CompleteProfileDto {
  @IsString()
  @IsCPF()
  cpf!: string;

  /** ISO (YYYY-MM-DD) */
  @IsString()
  birthDate!: string;
}
