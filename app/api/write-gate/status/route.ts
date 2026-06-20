import { NextResponse } from 'next/server';
import { isProductionRuntime } from '@/lib/write-gate';

export const dynamic = 'force-dynamic';

export type WriteGateMode = 'open' | 'locked' | 'misconfigured';

/** Read-only: tells the UI whether writes need a secret (never exposes the secret). */
export async function GET() {
  const secret = process.env.SHOPLOG_WRITE_SECRET?.trim();
  const isProduction = isProductionRuntime();

  let mode: WriteGateMode;
  if (!isProduction && !secret) {
    mode = 'open';
  } else if (isProduction && !secret) {
    mode = 'misconfigured';
  } else {
    mode = 'locked';
  }

  return NextResponse.json({ mode });
}
