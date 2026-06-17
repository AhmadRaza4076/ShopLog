import { NextRequest, NextResponse } from 'next/server';
import { DEMO_SHOP_ID, ensureDemoShop, getAllTransactions, saveParsedTransaction } from '@/lib/db';
import type { ParsedTransaction } from '@/lib/types';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDemoShop();
    const transactions = await getAllTransactions(DEMO_SHOP_ID);
    return NextResponse.json({ transactions });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load transactions.');
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = (await req.json()) as ParsedTransaction;

    if (typeof body.total_amount !== 'number') {
      return NextResponse.json({ error: 'total_amount is required' }, { status: 400 });
    }

    const transaction = await saveParsedTransaction(DEMO_SHOP_ID, body, 'typed', null);
    return NextResponse.json({ transaction });
  } catch (error) {
    return apiErrorResponse(error, 'Could not save transaction.');
  }
}
