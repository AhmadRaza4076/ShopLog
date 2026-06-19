import { describe, expect, it } from 'vitest';
import { validateParsedTransactionInput, validateVoiceAction } from './validate-transaction';

describe('validateParsedTransactionInput', () => {
  it('rejects zero total_amount for sales', () => {
    const result = validateParsedTransactionInput({
      type: 'sale',
      total_amount: 0,
      is_credit: false,
      confidence: 'high',
    });
    expect(result.ok).toBe(false);
  });

  it('accepts positive sale amounts', () => {
    const result = validateParsedTransactionInput({
      type: 'sale',
      total_amount: 500,
      is_credit: false,
      confidence: 'high',
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateVoiceAction', () => {
  it('rejects negative mark_payment amounts', () => {
    const result = validateVoiceAction({
      transcript: 'Ali paid',
      tool: 'mark_payment',
      customer_name: 'Ali',
      amount: -100,
    });
    expect(result.ok).toBe(false);
  });

  it('accepts valid mark_payment actions', () => {
    const result = validateVoiceAction({
      transcript: 'Ali paid 500',
      tool: 'mark_payment',
      customer_name: 'Ali',
      amount: 500,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.tool).toBe('mark_payment');
      expect(result.payload.amount).toBe(500);
    }
  });

  it('rejects unknown tools', () => {
    const result = validateVoiceAction({
      transcript: 'hack',
      tool: 'delete_everything',
    });
    expect(result.ok).toBe(false);
  });
});
