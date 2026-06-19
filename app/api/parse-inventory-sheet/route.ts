import { NextRequest, NextResponse } from 'next/server';
import { parseInventorySheetImage, parseInventorySheetText } from '@/lib/claude';
import { apiErrorResponse } from '@/lib/api-errors';
import { extractTextFromDocument, isDocumentMimeType } from '@/lib/document-extract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Parse a bulk inventory list — preview only, does not write to DB. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      text?: string;
      image?: string;
      mediaType?: 'image/jpeg' | 'image/png' | 'image/webp';
      document?: string;
      documentMimeType?: string;
    };

    if (body.text?.trim()) {
      const rows = await parseInventorySheetText(body.text);
      return NextResponse.json({ rows: sanitizeRows(rows) });
    }

    if (body.image) {
      const rows = await parseInventorySheetImage(body.image, body.mediaType ?? 'image/jpeg');
      return NextResponse.json({ rows: sanitizeRows(rows) });
    }

    if (body.document && body.documentMimeType) {
      if (!isDocumentMimeType(body.documentMimeType)) {
        return NextResponse.json(
          { error: 'Unsupported document type. Use PDF or Word (.docx) only.' },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(body.document, 'base64');
      const text = await extractTextFromDocument(buffer, body.documentMimeType);
      const rows = await parseInventorySheetText(text);
      return NextResponse.json({ rows: sanitizeRows(rows) });
    }

    return NextResponse.json({ error: 'text, image, or document is required' }, { status: 400 });
  } catch (error) {
    return apiErrorResponse(error, 'Could not read that inventory list.');
  }
}

function sanitizeRows(
  rows: { item_name: string; quantity: number; unit_price: number | null }[]
): { item_name: string; quantity: number; unit_price: number | null }[] {
  return rows
    .filter((r) => r.item_name?.trim() && r.quantity > 0)
    .map((r) => ({
      item_name: r.item_name.trim(),
      quantity: Number(r.quantity),
      unit_price: r.unit_price != null ? Number(r.unit_price) : null,
    }));
}
