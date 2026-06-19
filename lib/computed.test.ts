import { describe, expect, it } from 'vitest';
import {
  computeSalesGrouped,
  customerBalanceDelta,
  isRealSale,
  isStockAdjustment,
  STOCK_ADJUSTMENT_MARKER,
} from './computed';
import type { Transaction } from './types';

function txn(partial: Partial<Transaction> & Pick<Transaction, 'type' | 'total_amount'>): Transaction {
  return {
    id: '1',
    shop_id: 'shop',
    item_name: null,
    quantity: null,
    unit_price: null,
    customer_id: null,
    is_credit: false,
    source: 'typed',
    raw_input: null,
    sale_id: null,
    sale_notes: null,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe('customerBalanceDelta', () => {
  it('increases balance for credit sales and credit_given', () => {
    expect(customerBalanceDelta(txn({ type: 'sale', total_amount: 500, is_credit: true }))).toBe(500);
    expect(customerBalanceDelta(txn({ type: 'credit_given', total_amount: 200, is_credit: true }))).toBe(200);
  });

  it('decreases balance for payments', () => {
    expect(customerBalanceDelta(txn({ type: 'payment', total_amount: 300, is_credit: false }))).toBe(-300);
  });
});

describe('isStockAdjustment', () => {
  it('detects stock adjustment marker in sale_notes or raw_input', () => {
    expect(isStockAdjustment({ sale_notes: `${STOCK_ADJUSTMENT_MARKER}: set to 10`, raw_input: null })).toBe(true);
    expect(isStockAdjustment({ sale_notes: null, raw_input: `[${STOCK_ADJUSTMENT_MARKER}]` })).toBe(true);
    expect(isStockAdjustment({ sale_notes: null, raw_input: 'normal sale' })).toBe(false);
  });
});

describe('computeSalesGrouped', () => {
  it('excludes stock adjustments from sales totals', () => {
    const sales = computeSalesGrouped([
      txn({ id: 'a', type: 'sale', total_amount: 1000, sale_id: 's1' }),
      txn({
        id: 'b',
        type: 'sale',
        total_amount: 0,
        sale_notes: `${STOCK_ADJUSTMENT_MARKER}: set to 5`,
      }),
    ]);
    expect(sales).toHaveLength(1);
    expect(sales[0].total).toBe(1000);
    expect(isRealSale(txn({ type: 'sale', total_amount: 0, sale_notes: STOCK_ADJUSTMENT_MARKER }))).toBe(false);
  });
});
