import { describe, expect, it } from 'vitest';
import { displayPhone, normalizePhone } from '../src/core/phone';

describe('normalizePhone', () => {
  it.each([
    ['0612345678', '+212612345678'],
    ['06 12 34 56 78', '+212612345678'],
    ['06-12-34-56-78', '+212612345678'],
    ['+212 6 12 34 56 78', '+212612345678'],
    ['+2120612345678', '+212612345678'],
    ['00212712345678', '+212712345678'],
    ['212612345678', '+212612345678'],
    ['712345678', '+212712345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '0512345678', '061234567', '06123456789', '+33612345678', 'abcdefghij'])(
    'rejette %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it('affiche un numéro lisible', () => {
    expect(displayPhone('+212612345678')).toBe('06 12 34 56 78');
  });
});
