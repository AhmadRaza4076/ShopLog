import { NextRequest, NextResponse } from 'next/server';
import { DEMO_SHOP_ID, ensureDemoShop, getCustomerBalance, recordPayment } from '@/lib/db';
import { formatRupees } from '@/lib/computed';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const { customer_name, amount } = (await req.json()) as {
      customer_name: string;
      amount: number;
    };

    if (!customer_name?.trim()) {
      return NextResponse.json({ error: 'customer_name is required' }, { status: 400 });
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    const balanceInfo = await getCustomerBalance(DEMO_SHOP_ID, customer_name);
    if (!balanceInfo) {
      return NextResponse.json({ error: `No customer named "${customer_name}" found.` }, { status: 404 });
    }
    if (balanceInfo.balance <= 0) {
      return NextResponse.json({ error: `${balanceInfo.name} has no outstanding balance.` }, { status: 400 });
    }

    const transaction = await recordPayment(DEMO_SHOP_ID, customer_name, amount);
    const response: Record<string, unknown> = {
      transaction,
      customer_name: balanceInfo.name,
      amount,
    };
    if (amount > balanceInfo.balance) {
      response.warning = `Payment of ${formatRupees(amount)} exceeds balance of ${formatRupees(balanceInfo.balance)}.`;
    }
    return NextResponse.json(response);
  } catch (error) {
    return apiErrorResponse(error, 'Could not record payment.');
  }
}
