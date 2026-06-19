import { NextResponse } from 'next/server';

const UUID_PARSE_RE = /invalid input syntax for type uuid/i;

function isRecognizedClientError(message: string): boolean {
  return (
    message.includes('DATABASE_URL') ||
    message.includes('authentication') ||
    message.includes('invalid x-api-key') ||
    message.includes('401') ||
    message.includes('ANTHROPIC_API_KEY is not set') ||
    message.includes('rate') ||
    message.includes('429') ||
    message.includes('key_model_access_denied') ||
    message.includes('key not allowed to access model') ||
    (message.includes('403') && message.includes('model')) ||
    message.includes('required') ||
    message.includes('must be') ||
    message.includes('not found') ||
    message.includes('already exists') ||
    message.includes('Cannot delete') ||
    message.includes('No customer') ||
    message.includes('outstanding balance') ||
    message.includes('Invalid') ||
    message.includes('Unsupported')
  );
}

export function apiErrorResponse(error: unknown, fallback = 'Something went wrong.'): NextResponse {
  if (error instanceof Error) {
    const msg = error.message;
    console.error(error);

    if (UUID_PARSE_RE.test(msg)) {
      return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
    }

    if (msg.includes('DATABASE_URL')) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    if (msg.includes('authentication') || msg.includes('invalid x-api-key') || msg.includes('401')) {
      return NextResponse.json(
        {
          error:
            'AI authentication failed. Check ANTHROPIC_API_KEY and, if your hackathon provided one, ANTHROPIC_BASE_URL in .env.local — then restart npm run dev.',
        },
        { status: 503 }
      );
    }
    if (msg.includes('ANTHROPIC_API_KEY is not set')) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    if (msg.includes('rate') || msg.includes('429')) {
      return NextResponse.json({ error: 'AI service is busy — try again in a moment.' }, { status: 429 });
    }
    if (
      msg.includes('key_model_access_denied') ||
      msg.includes('key not allowed to access model') ||
      (msg.includes('403') && msg.includes('model'))
    ) {
      return NextResponse.json(
        {
          error:
            'AI model access error. Your hackathon key may only use claude-sonnet-4-6 and claude-opus-4.6 via the LiteLLM gateway — check ANTHROPIC_BASE_URL and restart the dev server.',
        },
        { status: 503 }
      );
    }

    if (isRecognizedClientError(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ error: fallback }, { status: 500 });
  }

  console.error(error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
