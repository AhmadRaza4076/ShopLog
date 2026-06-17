import { NextResponse } from 'next/server';

export function apiErrorResponse(error: unknown, fallback = 'Something went wrong.'): NextResponse {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('DATABASE_URL')) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    if (msg.includes('apiKey') || msg.includes('ANTHROPIC') || msg.includes('401')) {
      return NextResponse.json(
        { error: 'AI service is not configured. Check ANTHROPIC_API_KEY in your environment.' },
        { status: 503 }
      );
    }
    if (msg.includes('rate') || msg.includes('429')) {
      return NextResponse.json({ error: 'AI service is busy — try again in a moment.' }, { status: 429 });
    }
    return NextResponse.json({ error: msg || fallback }, { status: 500 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
