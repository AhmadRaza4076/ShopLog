import { NextRequest, NextResponse } from 'next/server';
import { DEMO_SHOP_ID, ensureDemoShop, getAllTransactions, normalizeShopItemNames, saveParsedTransaction } from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-errors';
import { validateParsedTransactionInput } from '@/lib/validate-transaction';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDemoShop();
    await normalizeShopItemNames(DEMO_SHOP_ID);
    const transactions = await getAllTransactions(DEMO_SHOP_ID);
    return NextResponse.json({ transactions });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load transactions.');
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = await req.json();
    const validated = validateParsedTransactionInput(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const transaction = await saveParsedTransaction(DEMO_SHOP_ID, validated.parsed, 'typed', null);
    return NextResponse.json({ transaction });
  } catch (error) {
    return apiErrorResponse(error, 'Could not save transaction.');
  }
}
