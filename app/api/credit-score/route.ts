import { NextRequest, NextResponse } from 'next/server';
import { DEMO_SHOP_ID, ensureDemoShop, getAllTransactions, getCustomerBalance } from '@/lib/db';
import { computeCreditScore } from '@/lib/scoring';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await ensureDemoShop();
    const customerName = req.nextUrl.searchParams.get('customer');

    if (!customerName) {
      return NextResponse.json({ error: 'customer query param is required' }, { status: 400 });
    }

    const balanceInfo = await getCustomerBalance(DEMO_SHOP_ID, customerName);
    if (!balanceInfo) {
      return NextResponse.json({ error: `No customer named "${customerName}" found.` }, { status: 404 });
    }

    const allTransactions = await getAllTransactions(DEMO_SHOP_ID);
    const result = computeCreditScore(balanceInfo.customer_id, balanceInfo.name, allTransactions);

    return NextResponse.json({ result });
  } catch (error) {
    return apiErrorResponse(error, 'Could not calculate credit score.');
  }
}
