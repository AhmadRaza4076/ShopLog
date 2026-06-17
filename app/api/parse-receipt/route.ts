import { NextRequest, NextResponse } from 'next/server';
import { parseReceiptImage } from '@/lib/claude';
import { DEMO_SHOP_ID, ensureDemoShop, saveParsedTransaction } from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const { image, mediaType } = (await req.json()) as {
      image: string;
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
    };

    if (!image) {
      return NextResponse.json({ error: 'image (base64) is required' }, { status: 400 });
    }

    const parsed = await parseReceiptImage(image, mediaType ?? 'image/jpeg');
    const rawInput = parsed.note ? `[Photo receipt] ${parsed.note}` : '[Photo receipt]';
    const transaction = await saveParsedTransaction(DEMO_SHOP_ID, parsed, 'photo', rawInput);

    return NextResponse.json({ parsed, transaction });
  } catch (error) {
    return apiErrorResponse(error, 'Could not read that receipt.');
  }
}
