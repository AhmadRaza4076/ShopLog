import { NextRequest, NextResponse } from 'next/server';
import { parseReceiptImage } from '@/lib/claude';
import { DEMO_SHOP_ID, ensureDemoShop, getAllTransactions, saveParsedTransaction } from '@/lib/db';
import { stockWarningForParsed, parsedForResponse } from '@/lib/computed';
import { apiErrorResponse } from '@/lib/api-errors';
import { assertBase64UploadSize } from '@/lib/upload-limits';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const { image, mediaType, intent } = (await req.json()) as {
      image: string;
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
      intent?: 'sale' | 'purchase' | 'payment' | 'credit_given';
    };

    if (!image) {
      return NextResponse.json({ error: 'image (base64) is required' }, { status: 400 });
    }
    assertBase64UploadSize(image, 'Image');

    const parsed = await parseReceiptImage(image, mediaType ?? 'image/jpeg', intent);
    const rawInput = parsed.note ? `[Photo receipt] ${parsed.note}` : '[Photo receipt]';
    const existing = await getAllTransactions(DEMO_SHOP_ID);
    const stock_warning = stockWarningForParsed(existing, parsed);
    const transaction = await saveParsedTransaction(DEMO_SHOP_ID, parsed, 'photo', rawInput);

    return NextResponse.json({
      parsed: parsedForResponse(parsed, transaction),
      transaction,
      stock_warning,
    });
  } catch (error) {
    return apiErrorResponse(error, 'Could not read that receipt.');
  }
}
