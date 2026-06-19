export const WRITE_HEADER = 'x-shoplog-secret';

const PREVIEW_EXEMPT = '/api/voice-command/preview';

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

export function isMutatingApiMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

export function isWriteGateExemptPath(pathname: string): boolean {
  return pathname === PREVIEW_EXEMPT;
}

export type WriteGateOutcome =
  | { action: 'allow' }
  | { action: 'deny'; status: 401; error: string }
  | { action: 'deny'; status: 503; error: string };

/** Pure write-gate decision — used by middleware and unit tests. */
export function evaluateWriteGate(input: {
  pathname: string;
  method: string;
  secret: string | undefined;
  providedHeader: string | null;
  isProduction: boolean;
}): WriteGateOutcome {
  const { pathname, method, secret, providedHeader, isProduction } = input;

  if (!pathname.startsWith('/api/')) return { action: 'allow' };
  if (!isMutatingApiMethod(method)) return { action: 'allow' };
  if (isWriteGateExemptPath(pathname)) return { action: 'allow' };

  if (!secret?.trim()) {
    if (isProduction) {
      return {
        action: 'deny',
        status: 503,
        error: 'Write access is disabled — server is missing SHOPLOG_WRITE_SECRET.',
      };
    }
    return { action: 'allow' };
  }

  if (providedHeader !== secret) {
    return {
      action: 'deny',
      status: 401,
      error: 'Write access locked. Enter the demo secret to continue.',
    };
  }

  return { action: 'allow' };
}
