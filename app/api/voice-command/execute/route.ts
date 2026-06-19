import { NextRequest, NextResponse } from 'next/server';
import { ensureDemoShop } from '@/lib/db';
import { apiErrorResponse } from '@/lib/api-errors';
import { validateVoiceAction } from '@/lib/validate-transaction';
import { executeVoiceAction } from '@/lib/voice-execute';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = await req.json();

    const validated = validateVoiceAction(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const result = await executeVoiceAction(validated.payload);
    return NextResponse.json({ requires_confirm: false, ...result });
  } catch (error) {
    return apiErrorResponse(error, 'Could not complete that action.');
  }
}
