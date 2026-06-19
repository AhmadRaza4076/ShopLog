import { NextRequest, NextResponse } from 'next/server';
import { DEMO_SHOP_ID, ensureDemoShop, getCustomerBalance, saveParsedTransaction } from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

/** Record manual udhaar (credit given) for a customer. */
export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = (await req.json()) as {
      customer_name: string;
      amount: number;
      description?: string | null;
    };

    if (!body.customer_name?.trim()) {
      return NextResponse.json({ error: 'customer_name is required' }, { status: 400 });
    }
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    const balanceInfo = await getCustomerBalance(DEMO_SHOP_ID, body.customer_name.trim());
    if (!balanceInfo) {
      return NextResponse.json(
        { error: `No customer named "${body.customer_name}" found.` },
        { status: 404 }
      );
    }

    const rawInput = body.description?.trim() || '[Manual udhaar from khaataa]';
    const transaction = await saveParsedTransaction(
      DEMO_SHOP_ID,
      {
        type: 'credit_given',
        item_name: null,
        quantity: null,
        unit_price: null,
        total_amount: body.amount,
        customer_name: balanceInfo.name,
        is_credit: true,
        confidence: 'high',
        note: 'Manual udhaar',
      },
      'system',
      rawInput
    );

    return NextResponse.json({ transaction, customer_name: balanceInfo.name, amount: body.amount });
  } catch (error) {
    return apiErrorResponse(error, 'Could not record udhaar.');
  }
}
