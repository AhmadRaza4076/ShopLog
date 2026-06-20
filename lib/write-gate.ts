export const WRITE_HEADER = 'x-shoplog-secret';

/** Legacy demo password — only used if UI still offers manual unlock when a custom secret is set. */
export const DEMO_WRITE_SECRET = 'shoplog-demo-unlock';

const PREVIEW_EXEMPT = '/api/voice-command/preview';

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

export function resolveWriteSecret(envSecret: string | undefined, _isProduction: boolean): string | undefined {
  const trimmed = envSecret?.trim();
  return trimmed || undefined;
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
  | { action: 'deny'; status: 401; error: string };

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

  const effectiveSecret = resolveWriteSecret(secret, isProduction);
  if (!effectiveSecret) return { action: 'allow' };

  if (providedHeader !== effectiveSecret) {
    return {
      action: 'deny',
      status: 401,
      error: 'Write access locked. Enter the demo secret to continue.',
    };
  }

  return { action: 'allow' };
}

export type WriteGateMode = 'open' | 'locked';

export function getWriteGateMode(envSecret: string | undefined, _isProduction: boolean): WriteGateMode {
  if (!envSecret?.trim()) return 'open';
  return 'locked';
}

export function usesDemoWriteSecret(_envSecret: string | undefined, _isProduction: boolean): boolean {
  return false;
}
