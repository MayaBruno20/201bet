import { isValidCpf } from './cpf.validator';

describe('isValidCpf', () => {
  it('aceita CPFs válidos (com e sem pontuação)', () => {
    expect(isValidCpf('00873972007')).toBe(true);
    expect(isValidCpf('008.739.720-07')).toBe(true);
    expect(isValidCpf('11144477735')).toBe(true);
  });

  it('rejeita sequências de dígitos repetidos', () => {
    expect(isValidCpf('44444444444')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('99999999999')).toBe(false);
  });

  it('rejeita dígito verificador errado', () => {
    expect(isValidCpf('12345678900')).toBe(false);
    expect(isValidCpf('00873972008')).toBe(false);
  });

  it('rejeita tamanho errado, vazio e nulo', () => {
    expect(isValidCpf('4444444444')).toBe(false); // 10 dígitos
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('')).toBe(false);
    expect(isValidCpf(null)).toBe(false);
    expect(isValidCpf(undefined)).toBe(false);
  });
});
