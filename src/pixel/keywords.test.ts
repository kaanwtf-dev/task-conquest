import { describe, expect, it } from 'vitest';
import { guessAisle, lookup } from './keywords';

describe('keyword icons', () => {
  it('matches the meaningful word in a phrase', () => {
    expect(lookup('buy oat milk')?.emoji).toBe('🥛');
    expect(lookup('Bananas')?.emoji).toBe('🍌');
    expect(lookup('strawberries')?.emoji).toBe('🍓');
    expect(lookup('Take out trash')?.emoji).toBe('🗑️');
  });

  it('prefers multi-word phrases', () => {
    expect(lookup('call mom')?.emoji).toBe('☎️');
    expect(lookup('toilet paper')?.emoji).toBe('🧻');
  });

  it('guesses grocery aisles', () => {
    expect(guessAisle('Eggs')).toBe('dairy');
    expect(guessAisle('chicken thighs')).toBe('meat');
    expect(guessAisle('Zorblax')).toBe('other');
  });
});
