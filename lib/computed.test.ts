import { describe, expect, it } from 'vitest';
import {
  computeSalesGrouped,
  customerBalanceDelta,
  enrichParsedTransactionAmounts,
  isRealSale,
  isStockAdjustment,
  STOCK_ADJUSTMENT_MARKER,
} from './computed';
import type { ParsedTransaction, ShopItem, Transaction } from './types';

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

describe('enrichParsedTransactionAmounts', () => {
  const cementCatalog: ShopItem[] = [
    {
      id: '1',
      shop_id: 'shop',
      item_name: 'Cement (bag)',
      buy_price: 950,
      sell_price: 1100,
      low_stock_at: 5,
      updated_at: new Date().toISOString(),
    },
  ];

  it('infers total from quantity and catalog sell price for alias item names', () => {
    const parsed: ParsedTransaction = {
      type: 'sale',
      item_name: 'cement',
      quantity: 2,
      unit_price: null,
      total_amount: 0,
      customer_name: null,
      is_credit: false,
      confidence: 'medium',
    };
    const enriched = enrichParsedTransactionAmounts(parsed, { catalog: cementCatalog });
    expect(enriched.item_name).toBe('Cement (bag)');
    expect(enriched.unit_price).toBe(1100);
    expect(enriched.total_amount).toBe(2200);
  });

  it('derives unit_price when total and quantity are known', () => {
    const parsed: ParsedTransaction = {
      type: 'sale',
      item_name: 'Cement (bag)',
      quantity: 2,
      unit_price: null,
      total_amount: 2200,
      customer_name: null,
      is_credit: false,
      confidence: 'high',
    };
    const enriched = enrichParsedTransactionAmounts(parsed, { catalog: cementCatalog });
    expect(enriched.unit_price).toBe(1100);
    expect(enriched.total_amount).toBe(2200);
  });
});
