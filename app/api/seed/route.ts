import { NextRequest, NextResponse } from 'next/server';
import {
  DEMO_SHOP_ID,
  backfillShopItemsFromTransactions,
  ensureDemoShop,
  getOrCreateCustomer,
  sql,
} from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

interface SeedTxn {
  type: 'sale' | 'purchase' | 'payment' | 'credit_given';
  item_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number;
  customer_name: string | null;
  is_credit: boolean;
  daysAgo: number;
}

const CUSTOMER_PHONES: Record<string, string> = {
  'Ali Raza': '03001234567',
  'Sana Tariq': '03009876543',
};

const SEED_DATA: SeedTxn[] = [
  { type: 'purchase', item_name: 'Cement (bag)', quantity: 50, unit_price: 950, total_amount: 47500, customer_name: null, is_credit: false, daysAgo: 21 },
  { type: 'purchase', item_name: 'Rice (50kg bag)', quantity: 10, unit_price: 7200, total_amount: 72000, customer_name: null, is_credit: false, daysAgo: 18 },
  { type: 'sale', item_name: 'Cement (bag)', quantity: 5, unit_price: 1000, total_amount: 5000, customer_name: 'Ali Raza', is_credit: true, daysAgo: 15 },
  { type: 'sale', item_name: 'Rice (50kg bag)', quantity: 1, unit_price: 7500, total_amount: 7500, customer_name: 'Bilal Hussain', is_credit: false, daysAgo: 14 },
  { type: 'sale', item_name: 'Cement (bag)', quantity: 3, unit_price: 1000, total_amount: 3000, customer_name: 'Ali Raza', is_credit: true, daysAgo: 12 },
  { type: 'payment', item_name: null, quantity: null, unit_price: null, total_amount: 4000, customer_name: 'Ali Raza', is_credit: false, daysAgo: 10 },
  { type: 'sale', item_name: 'Rice (50kg bag)', quantity: 2, unit_price: 7500, total_amount: 15000, customer_name: 'Sana Tariq', is_credit: true, daysAgo: 9 },
  { type: 'sale', item_name: 'Cement (bag)', quantity: 8, unit_price: 1000, total_amount: 8000, customer_name: 'Bilal Hussain', is_credit: false, daysAgo: 7 },
  { type: 'payment', item_name: null, quantity: null, unit_price: null, total_amount: 7000, customer_name: 'Sana Tariq', is_credit: false, daysAgo: 5 },
  { type: 'sale', item_name: 'Rice (50kg bag)', quantity: 1, unit_price: 7500, total_amount: 7500, customer_name: 'Ali Raza', is_credit: true, daysAgo: 3 },
  { type: 'sale', item_name: 'Cement (bag)', quantity: 4, unit_price: 1000, total_amount: 4000, customer_name: 'Sana Tariq', is_credit: true, daysAgo: 1 },
];

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = (await req.json().catch(() => ({}))) as { replace?: boolean };
    const replace = body.replace === true;

    const db = sql();

    const existing = await db`
      select count(*)::int as n from transactions
      where shop_id = ${DEMO_SHOP_ID} and source = 'system'
    `;
    const systemCount = Number((existing as { n: number }[])[0]?.n ?? 0);

    if (systemCount > 0 && !replace) {
      return NextResponse.json({ skipped: true, reason: 'Already seeded' });
    }

    await db`
      delete from transactions
      where shop_id = ${DEMO_SHOP_ID} and source = 'system'
    `;

    await db`
      delete from customers c
      where c.shop_id = ${DEMO_SHOP_ID}
        and not exists (
          select 1 from transactions t where t.customer_id = c.id
        )
    `;

    for (const txn of SEED_DATA) {
      let customerId: string | null = null;
      if (txn.customer_name) {
        const customer = await getOrCreateCustomer(
          DEMO_SHOP_ID,
          txn.customer_name,
          CUSTOMER_PHONES[txn.customer_name] ?? null
        );
        customerId = customer.id;
      }

      await db`
        insert into transactions
          (shop_id, type, item_name, quantity, unit_price, total_amount, customer_id, is_credit, source, raw_input, created_at)
        values
          (${DEMO_SHOP_ID}, ${txn.type}, ${txn.item_name}, ${txn.quantity}, ${txn.unit_price},
           ${txn.total_amount}, ${customerId}, ${txn.is_credit}, 'system', null,
           now() - (${txn.daysAgo} || ' days')::interval)
      `;
    }

    await backfillShopItemsFromTransactions(DEMO_SHOP_ID);

    return NextResponse.json({ seeded: SEED_DATA.length, replaced: systemCount > 0 });
  } catch (error) {
    return apiErrorResponse(error, 'Could not seed demo data.');
  }
}
