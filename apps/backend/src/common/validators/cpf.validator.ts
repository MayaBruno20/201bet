import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Valida um CPF brasileiro de verdade: exige 11 dígitos, rejeita sequências de
 * dígitos repetidos (ex.: 11111111111) e confere os dois dígitos verificadores
 * (mód-11). Aceita o CPF com ou sem pontuação (normaliza para só dígitos).
 *
 * Antes só existia `@Matches(/^\d{11}$/)` espalhado pelos DTOs, que deixava
 * passar qualquer 11 dígitos (44444444444, 12345678900, etc.).
 */
export function isValidCpf(value: string | null | undefined): boolean {
  const cpf = (value ?? '').replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais

  const digits = cpf.split('').map((d) => Number(d));
  const checkDigit = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}

@ValidatorConstraint({ name: 'isCpf', async: false })
class IsCpfConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidCpf(value);
  }

  defaultMessage(): string {
    return 'CPF inválido';
  }
}

/** Decorator class-validator: aceita só CPFs válidos (dígitos verificadores). */
export function IsCPF(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCpfConstraint,
    });
  };
}
