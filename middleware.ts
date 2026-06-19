import { NextRequest, NextResponse } from 'next/server';
import { evaluateWriteGate, WRITE_HEADER } from '@/lib/write-gate';

export function middleware(req: NextRequest) {
  const outcome = evaluateWriteGate({
    pathname: req.nextUrl.pathname,
    method: req.method,
    secret: process.env.SHOPLOG_WRITE_SECRET,
    providedHeader: req.headers.get(WRITE_HEADER),
    isProduction: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1',
  });

  if (outcome.action === 'deny') {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
