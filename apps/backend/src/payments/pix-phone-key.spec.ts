import { BadRequestException } from '@nestjs/common';
import { normalizeBrazilPixPhoneKey } from './pix-phone-key';

describe('normalizeBrazilPixPhoneKey', () => {
  it('normalizes 11 digits with DDD', () => {
    expect(normalizeBrazilPixPhoneKey('11987654321')).toBe('+5511987654321');
  });

  it('normalizes masked input', () => {
    expect(normalizeBrazilPixPhoneKey('(11) 98765-4321')).toBe(
      '+5511987654321',
    );
  });

  it('keeps +55 form', () => {
    expect(normalizeBrazilPixPhoneKey('+55 11 98765-4321')).toBe(
      '+5511987654321',
    );
  });

  it('normalizes 55 prefix without plus', () => {
    expect(normalizeBrazilPixPhoneKey('5511987654321')).toBe(
      '+5511987654321',
    );
  });

  it('strips leading 0 trunk prefix', () => {
    expect(normalizeBrazilPixPhoneKey('011987654321')).toBe('+5511987654321');
  });

  it('accepts 10-digit landline', () => {
    expect(normalizeBrazilPixPhoneKey('1130000000')).toBe('+551130000000');
  });

  it('rejects too few digits', () => {
    expect(() => normalizeBrazilPixPhoneKey('987654321')).toThrow(
      BadRequestException,
    );
  });
});
