import { BadRequestException } from '@nestjs/common';

/**
 * Valut exige chave PIX telefone no formato E.164 BR: +55 + DDD + número (10 ou 11 dígitos após o 55).
 */
export function normalizeBrazilPixPhoneKey(raw: string): string {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  // Prefixo nacional de longa distância (0)
  if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.replace(/^0+/, '');
  }
  let national: string;
  if (digits.startsWith('55') && digits.length >= 12) {
    national = digits.slice(2);
  } else if (digits.length >= 10 && digits.length <= 11) {
    national = digits;
  } else {
    throw new BadRequestException(
      'Telefone da chave PIX inválido. Use DDD + número (ex.: 11999999999) ou já com +55.',
    );
  }
  if (national.length < 10 || national.length > 11) {
    throw new BadRequestException(
      'Telefone da chave PIX inválido. São necessários 10 ou 11 dígitos após o +55 (DDD + número).',
    );
  }
  const e164 = `+55${national}`;
  if (!/^\+55\d{10,11}$/.test(e164)) {
    throw new BadRequestException('Telefone da chave PIX inválido.');
  }
  return e164;
}
