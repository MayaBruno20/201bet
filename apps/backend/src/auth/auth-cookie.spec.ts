import { jwtExpiresInToMilliseconds } from './auth-cookie';

describe('auth-cookie', () => {
  describe('jwtExpiresInToMilliseconds', () => {
    it('parses h suffix', () => {
      expect(jwtExpiresInToMilliseconds('8h')).toBe(8 * 3_600_000);
    });

    it('parses d suffix', () => {
      expect(jwtExpiresInToMilliseconds('1d')).toBe(86_400_000);
    });

    it('parses s suffix', () => {
      expect(jwtExpiresInToMilliseconds('60s')).toBe(60_000);
    });

    it('returns default when format is unknown', () => {
      expect(jwtExpiresInToMilliseconds('not-a-duration')).toBe(8 * 60 * 60 * 1000);
    });
  });
});
