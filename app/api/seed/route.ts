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

/** Populate when custom demo data is provided. */
const CUSTOMER_PHONES: Record<string, string> = {};

const SEED_DATA: SeedTxn[] = [];

export async function POST(req: NextRequest) {
  try {
    if (SEED_DATA.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'No seed data configured' });
    }

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
