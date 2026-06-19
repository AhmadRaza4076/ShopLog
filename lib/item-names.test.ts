import { describe, expect, it } from 'vitest';
import { canonicalItemName } from './item-names';

describe('canonicalItemName', () => {
  it('does not merge substring names like Tea and Green Tea', () => {
    const known = ['Tea', 'Green Tea'];
    expect(canonicalItemName('Tea', known)).toBe('Tea');
    expect(canonicalItemName('Green Tea', known)).toBe('Green Tea');
    expect(canonicalItemName('tea', known)).toBe('Tea');
  });

  it('matches known names case-insensitively', () => {
    expect(canonicalItemName('RICE', ['Rice (50kg bag)'])).toBe('Rice (50kg bag)');
  });

  it('returns trimmed input when no match', () => {
    expect(canonicalItemName('  New Item  ', ['Tea'])).toBe('New Item');
  });
});
