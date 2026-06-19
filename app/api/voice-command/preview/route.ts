import { NextRequest, NextResponse } from 'next/server';
import { runVoiceCommand } from '@/lib/claude';
import { DEMO_SHOP_ID, ensureDemoShop, getAllCustomers, getAllTransactions, getShopItems } from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-errors';
import { buildVoicePreview, serializeAction } from '@/lib/voice-preview';
import { executeReadOnlyVoiceAction, executeVoiceAction } from '@/lib/voice-execute';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const { transcript } = (await req.json()) as { transcript: string };

    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    const action = await runVoiceCommand(transcript);
    const [transactions, customers, catalog] = await Promise.all([
      getAllTransactions(DEMO_SHOP_ID),
      getAllCustomers(DEMO_SHOP_ID),
      getShopItems(DEMO_SHOP_ID),
    ]);
    const built = buildVoicePreview(action, transactions, customers, catalog);

    if (!built.requires_confirm) {
      let executed = await executeReadOnlyVoiceAction(action);
      if (!executed && action.tool === 'set_stock') {
        executed = await executeVoiceAction({ ...action, transcript });
      }
      if (executed) {
        return NextResponse.json({
          requires_confirm: false,
          preview: built.preview,
          speech: executed.speech,
          navigate: executed.navigate,
          navigateQuery: executed.navigateQuery,
          data: executed.data,
        });
      }
    }

    return NextResponse.json({
      requires_confirm: built.requires_confirm,
      preview: built.preview,
      stock_warning: built.stock_warning,
      pending_action: serializeAction(action, transcript),
    });
  } catch (error) {
    return apiErrorResponse(error, 'Voice command failed.');
  }
}
