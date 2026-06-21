import { NextRequest, NextResponse } from 'next/server';
import { parseInventorySheetImage, parseInventorySheetText } from '@/lib/claude';
import { apiErrorResponse } from '@/lib/api-errors';
import { extractTextFromDocument, isDocumentMimeType } from '@/lib/document-extract';
import { assertBase64UploadSize, assertTextLength } from '@/lib/upload-limits';

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
      assertTextLength(body.text);
      const rows = await parseInventorySheetText(body.text);
      return NextResponse.json({ rows: sanitizeRows(rows) });
    }

    if (body.image) {
      assertBase64UploadSize(body.image, 'Image');
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
      assertBase64UploadSize(body.document, 'Document');
      const buffer = Buffer.from(body.document, 'base64');
      const text = await extractTextFromDocument(buffer, body.documentMimeType);
      // #region agent log
      fetch('http://127.0.0.1:7529/ingest/2b3e9191-6f23-4f1c-9132-c4bd485c14ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4ca096'},body:JSON.stringify({sessionId:'4ca096',location:'parse-inventory-sheet/route.ts:document',message:'PDF/doc text extracted',data:{mime:body.documentMimeType,textLen:text.length,preview:text.slice(0,80)},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      assertTextLength(text, 'Extracted document text');
      const rows = await parseInventorySheetText(text);
      return NextResponse.json({ rows: sanitizeRows(rows) });
    }

    return NextResponse.json({ error: 'text, image, or document is required' }, { status: 400 });
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/2b3e9191-6f23-4f1c-9132-c4bd485c14ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4ca096'},body:JSON.stringify({sessionId:'4ca096',location:'parse-inventory-sheet/route.ts:error',message:'Bulk parse failed',data:{error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
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
