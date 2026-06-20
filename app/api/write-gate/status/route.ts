import { NextResponse } from 'next/server';
import {
  getWriteGateMode,
  isProductionRuntime,
  usesDemoWriteSecret,
} from '@/lib/write-gate';

export const dynamic = 'force-dynamic';

/** Read-only: tells the UI whether writes need a secret (never exposes the secret). */
export async function GET() {
  const envSecret = process.env.SHOPLOG_WRITE_SECRET;
  const isProduction = isProductionRuntime();

  return NextResponse.json({
    mode: getWriteGateMode(envSecret, isProduction),
    demo_default: usesDemoWriteSecret(envSecret, isProduction),
  });
}
