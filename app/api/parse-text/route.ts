import { NextRequest, NextResponse } from 'next/server';
import { parseEntryText } from '@/lib/claude';
import { DEMO_SHOP_ID, ensureDemoShop, getAllTransactions, saveParsedTransaction } from '@/lib/db';
import { stockWarningForParsed, parsedForResponse } from '@/lib/computed';
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
    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/2b3e9191-6f23-4f1c-9132-c4bd485c14ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4ca096'},body:JSON.stringify({sessionId:'4ca096',location:'parse-text/route.ts:parsed',message:'Claude parsed entry',data:{text:text.slice(0,120),intent,source,type:parsed.type,item:parsed.item_name,qty:parsed.quantity,unit:parsed.unit_price,total:parsed.total_amount},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const existing = await getAllTransactions(DEMO_SHOP_ID);
    const stock_warning = stockWarningForParsed(existing, parsed);
    const transaction = await saveParsedTransaction(DEMO_SHOP_ID, parsed, source ?? 'typed', text);
    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/2b3e9191-6f23-4f1c-9132-c4bd485c14ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4ca096'},body:JSON.stringify({sessionId:'4ca096',location:'parse-text/route.ts:saved',message:'Entry saved',data:{txnId:transaction.id,total:transaction.total_amount,item:transaction.item_name},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({
      parsed: parsedForResponse(parsed, transaction),
      transaction,
      stock_warning,
    });
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7529/ingest/2b3e9191-6f23-4f1c-9132-c4bd485c14ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4ca096'},body:JSON.stringify({sessionId:'4ca096',location:'parse-text/route.ts:error',message:'Parse entry failed',data:{error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return apiErrorResponse(error, 'Could not parse that entry.');
  }
}
