import { NextRequest, NextResponse } from 'next/server';
import { parseEntryText } from '@/lib/claude';
import { DEMO_SHOP_ID, ensureDemoShop, getAllTransactions, saveParsedTransaction } from '@/lib/db';
import { stockWarningForParsed } from '@/lib/computed';
import { apiErrorResponse } from '@/lib/api-errors';
import { assertTextLength } from '@/lib/upload-limits';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const { text, source, intent } = (await req.json()) as {
      text: string;
      source?: 'typed' | 'voice';
      intent?: 'sale' | 'purchase' | 'payment' | 'credit_given';
    };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }
    assertTextLength(text);

    const parsed = await parseEntryText(text, intent);
    const existing = await getAllTransactions(DEMO_SHOP_ID);
    const stock_warning = stockWarningForParsed(existing, parsed);
    const transaction = await saveParsedTransaction(DEMO_SHOP_ID, parsed, source ?? 'typed', text);

    return NextResponse.json({ parsed, transaction, stock_warning });
  } catch (error) {
    return apiErrorResponse(error, 'Could not parse that entry.');
  }
}
