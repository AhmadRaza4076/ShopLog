import type { VoiceAgentAction } from './claude';
import { normalizeParsedTransaction } from './computed';
import type { ParsedTransaction, TransactionType } from './types';
import type { VoiceActionPayload } from './voice-preview';

const VALID_TYPES: TransactionType[] = ['sale', 'purchase', 'payment', 'credit_given'];
const VALID_CONFIDENCE = ['high', 'medium', 'low'] as const;
const VALID_PAGES = ['dashboard', 'sales', 'inventory', 'khaataa', 'entry', 'history'] as const;

const VOICE_TOOLS = new Set([
  'navigate_to',
  'lookup_inventory',
  'list_inventory',
  'lookup_customer',
  'add_stock',
  'set_stock',
  'add_customer',
  'add_transaction',
  'mark_payment',
  'get_balance',
  'get_today_profit',
  'get_credit_score',
  'send_reminder',
  'unclear',
]);

function positiveAmount(type: TransactionType, amount: number): boolean {
  if (type === 'credit_given') return amount > 0;
  if (type === 'sale' || type === 'purchase' || type === 'payment') return amount > 0;
  return amount >= 0;
}

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

  const type = b.type as TransactionType;

  if (typeof b.total_amount !== 'number' || !Number.isFinite(b.total_amount)) {
    return { ok: false, error: 'total_amount must be a finite number.' };
  }

  if (!positiveAmount(type, b.total_amount)) {
    return { ok: false, error: 'total_amount must be greater than zero for this transaction type.' };
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
    type,
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

/** Throws if parsed transaction is invalid — use at the DB write boundary. */
export function assertValidParsedTransaction(parsed: ParsedTransaction): ParsedTransaction {
  const result = validateParsedTransactionInput(parsed);
  if (!result.ok) throw new Error(result.error);
  return result.parsed;
}

function nonEmptyString(value: unknown, field: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

function positiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function validateVoiceAgentAction(action: Record<string, unknown>): VoiceAgentAction | null {
  const tool = action.tool;
  if (typeof tool !== 'string' || !VOICE_TOOLS.has(tool)) return null;

  switch (tool) {
    case 'navigate_to': {
      const page = action.page;
      if (typeof page !== 'string' || !VALID_PAGES.includes(page as (typeof VALID_PAGES)[number])) {
        return null;
      }
      const query = action.query;
      return {
        tool: 'navigate_to',
        page: page as (typeof VALID_PAGES)[number],
        query: query == null ? null : typeof query === 'string' ? query : null,
      };
    }
    case 'lookup_inventory': {
      const query = nonEmptyString(action.query, 'query');
      return query ? { tool: 'lookup_inventory', query } : null;
    }
    case 'list_inventory':
      return { tool: 'list_inventory' };
    case 'lookup_customer': {
      const query = nonEmptyString(action.query, 'query');
      return query ? { tool: 'lookup_customer', query } : null;
    }
    case 'add_stock': {
      const item_name = nonEmptyString(action.item_name, 'item_name');
      const quantity = positiveNumber(action.quantity);
      if (!item_name || quantity == null) return null;
      return {
        tool: 'add_stock',
        item_name,
        quantity,
        unit_price:
          action.unit_price == null
            ? null
            : typeof action.unit_price === 'number' && Number.isFinite(action.unit_price)
              ? action.unit_price
              : null,
      };
    }
    case 'set_stock': {
      const item_name = nonEmptyString(action.item_name, 'item_name');
      const target_quantity =
        typeof action.target_quantity === 'number' &&
        Number.isFinite(action.target_quantity) &&
        action.target_quantity >= 0
          ? action.target_quantity
          : null;
      if (!item_name || target_quantity == null) return null;
      return {
        tool: 'set_stock',
        item_name,
        target_quantity,
        unit_price:
          action.unit_price == null
            ? null
            : typeof action.unit_price === 'number' && Number.isFinite(action.unit_price)
              ? action.unit_price
              : null,
      };
    }
    case 'add_customer': {
      const name = nonEmptyString(action.name, 'name');
      if (!name) return null;
      return {
        tool: 'add_customer',
        name,
        phone:
          action.phone == null
            ? null
            : typeof action.phone === 'string'
              ? action.phone.trim() || null
              : null,
      };
    }
    case 'add_transaction': {
      const parsedResult = validateParsedTransactionInput(action.parsed);
      if (!parsedResult.ok) return null;
      return { tool: 'add_transaction', parsed: parsedResult.parsed };
    }
    case 'mark_payment': {
      const customer_name = nonEmptyString(action.customer_name, 'customer_name');
      const amount = positiveNumber(action.amount);
      if (!customer_name || amount == null) return null;
      return { tool: 'mark_payment', customer_name, amount };
    }
    case 'get_balance': {
      const customer_name = nonEmptyString(action.customer_name, 'customer_name');
      return customer_name ? { tool: 'get_balance', customer_name } : null;
    }
    case 'get_today_profit':
      return { tool: 'get_today_profit' };
    case 'get_credit_score': {
      const customer_name = nonEmptyString(action.customer_name, 'customer_name');
      return customer_name ? { tool: 'get_credit_score', customer_name } : null;
    }
    case 'send_reminder': {
      const customer_name = nonEmptyString(action.customer_name, 'customer_name');
      return customer_name ? { tool: 'send_reminder', customer_name } : null;
    }
    case 'unclear': {
      const reason = nonEmptyString(action.reason, 'reason');
      return reason ? { tool: 'unclear', reason } : null;
    }
    default:
      return null;
  }
}

export function validateVoiceAction(
  body: unknown
): { ok: true; payload: VoiceActionPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid voice action payload.' };
  }

  const v = body as Record<string, unknown>;
  const transcript = typeof v.transcript === 'string' ? v.transcript : '';
  const action = validateVoiceAgentAction(v);

  if (!action) {
    return { ok: false, error: 'Invalid or unsupported voice action.' };
  }

  return { ok: true, payload: { ...action, transcript } };
}
