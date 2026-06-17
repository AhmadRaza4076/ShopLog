import { NextRequest, NextResponse } from 'next/server';
import { draftReminder } from '@/lib/claude';
import { DEMO_SHOP_ID, ensureDemoShop, getAllTransactions, getCustomerBalance } from '@/lib/db';
import { daysSinceLastPayment } from '@/lib/computed';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const { customer_name } = (await req.json()) as { customer_name: string };

    if (!customer_name) {
      return NextResponse.json({ error: 'customer_name is required' }, { status: 400 });
    }

    const balanceInfo = await getCustomerBalance(DEMO_SHOP_ID, customer_name);
    if (!balanceInfo) {
      return NextResponse.json({ error: `No customer named "${customer_name}" found.` }, { status: 404 });
    }
    if (balanceInfo.balance <= 0) {
      return NextResponse.json({ error: `${balanceInfo.name} has no outstanding balance.` }, { status: 400 });
    }

    const allTransactions = await getAllTransactions(DEMO_SHOP_ID);
    const daysSince = daysSinceLastPayment(balanceInfo.customer_id, allTransactions);
    const message = await draftReminder(balanceInfo.name, balanceInfo.balance, daysSince);
    return NextResponse.json({ message, customer_name: balanceInfo.name, amount_owed: balanceInfo.balance });
  } catch (error) {
    return apiErrorResponse(error, 'Could not draft a reminder.');
  }
}
