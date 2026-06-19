import { normalizeParsedTransaction } from './computed';
import type { ParsedTransaction, TransactionType } from './types';

const VALID_TYPES: TransactionType[] = ['sale', 'purchase', 'payment', 'credit_given'];
const VALID_CONFIDENCE = ['high', 'medium', 'low'] as const;

export function validateParsedTransactionInput(
  body: unknown
): { ok: true; parsed: ParsedTransaction } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.type !== 'string' || !VALID_TYPES.includes(b.type as TransactionType)) {
    return { ok: false, error: 'type must be one of: sale, purchase, payment, credit_given.' };
  }

  if (typeof b.total_amount !== 'number' || !Number.isFinite(b.total_amount) || b.total_amount < 0) {
    return { ok: false, error: 'total_amount must be a non-negative finite number.' };
  }

  if (typeof b.is_credit !== 'boolean') {
    return { ok: false, error: 'is_credit must be a boolean.' };
  }

  if (
    typeof b.confidence !== 'string' ||
    !VALID_CONFIDENCE.includes(b.confidence as (typeof VALID_CONFIDENCE)[number])
  ) {
    return { ok: false, error: 'confidence must be high, medium, or low.' };
  }

  if (b.quantity != null) {
    if (typeof b.quantity !== 'number' || !Number.isFinite(b.quantity) || b.quantity < 0) {
      return { ok: false, error: 'quantity must be a non-negative finite number when provided.' };
    }
  }

  if (b.unit_price != null) {
    if (typeof b.unit_price !== 'number' || !Number.isFinite(b.unit_price) || b.unit_price < 0) {
      return { ok: false, error: 'unit_price must be a non-negative finite number when provided.' };
    }
  }

  const item_name =
    b.item_name == null ? null : typeof b.item_name === 'string' ? b.item_name : null;
  if (b.item_name != null && item_name === null) {
    return { ok: false, error: 'item_name must be a string or null.' };
  }

  const customer_name =
    b.customer_name == null ? null : typeof b.customer_name === 'string' ? b.customer_name : null;
  if (b.customer_name != null && customer_name === null) {
    return { ok: false, error: 'customer_name must be a string or null.' };
  }

  const parsed: ParsedTransaction = normalizeParsedTransaction({
    type: b.type as TransactionType,
    item_name,
    quantity: (b.quantity as number | null) ?? null,
    unit_price: (b.unit_price as number | null) ?? null,
    total_amount: b.total_amount,
    customer_name,
    is_credit: b.is_credit,
    confidence: b.confidence as ParsedTransaction['confidence'],
    note: typeof b.note === 'string' ? b.note : undefined,
  });

  return { ok: true, parsed };
}
