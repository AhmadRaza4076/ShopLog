import { NextRequest, NextResponse } from 'next/server';
import { parseEntryText } from '@/lib/claude';
import { DEMO_SHOP_ID, ensureDemoShop, saveParsedTransaction } from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const { text, source } = (await req.json()) as { text: string; source?: 'typed' | 'voice' };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const parsed = await parseEntryText(text);
    const transaction = await saveParsedTransaction(DEMO_SHOP_ID, parsed, source ?? 'typed', text);

    return NextResponse.json({ parsed, transaction });
  } catch (error) {
    return apiErrorResponse(error, 'Could not parse that entry.');
  }
}
