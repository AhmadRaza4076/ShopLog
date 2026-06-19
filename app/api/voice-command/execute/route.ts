import { NextRequest, NextResponse } from 'next/server';
import { ensureDemoShop } from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-errors';
import { isVoiceActionPayload } from '@/lib/voice-preview';
import { executeVoiceAction } from '@/lib/voice-execute';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = await req.json();

    if (!isVoiceActionPayload(body)) {
      return NextResponse.json({ error: 'Invalid voice action payload.' }, { status: 400 });
    }

    const result = await executeVoiceAction(body);
    return NextResponse.json({ requires_confirm: false, ...result });
  } catch (error) {
    return apiErrorResponse(error, 'Could not complete that action.');
  }
}
