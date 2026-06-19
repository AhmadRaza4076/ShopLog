import { NextRequest, NextResponse } from 'next/server';
import {
  DEMO_SHOP_ID,
  ensureDemoShop,
  getAllTransactions,
  normalizeShopItemNames,
  saveSale,
} from '@/lib/db';
import { computeSalesGrouped } from '@/lib/computed';
import type { SaleInput } from '@/lib/types';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDemoShop();
    await normalizeShopItemNames(DEMO_SHOP_ID);
    const transactions = await getAllTransactions(DEMO_SHOP_ID);
    const sales = computeSalesGrouped(transactions);
    return NextResponse.json({ sales });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load sales.');
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = (await req.json()) as SaleInput;

    if (!body.lines?.length) {
      return NextResponse.json({ error: 'At least one line item is required.' }, { status: 400 });
    }
    if (body.payment !== 'cash' && body.payment !== 'credit') {
      return NextResponse.json({ error: 'payment must be cash or credit.' }, { status: 400 });
    }

    const result = await saveSale(DEMO_SHOP_ID, body, 'typed');
    const sales = computeSalesGrouped(await getAllTransactions(DEMO_SHOP_ID));
    return NextResponse.json({ ...result, sales });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Could not record sale.';
    if (msg.includes('required') || msg.includes('line item')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return apiErrorResponse(error, 'Could not record sale.');
  }
}
