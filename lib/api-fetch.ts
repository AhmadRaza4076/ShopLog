const WRITE_HEADER = 'x-shoplog-secret';
const STORAGE_KEY = 'shoplog-write-secret';

export { WRITE_HEADER };

export function getWriteSecret(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setWriteSecret(secret: string): void {
  sessionStorage.setItem(STORAGE_KEY, secret.trim());
}

export function clearWriteSecret(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Attach write secret on mutating API calls; dispatches shoplog:write-locked on 401. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? 'GET').toUpperCase();
  const url = typeof input === 'string' ? input : input.toString();
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const isPreview = url.includes('/api/voice-command/preview');

  if (isMutation && !isPreview) {
    const secret = getWriteSecret();
    if (secret) headers.set(WRITE_HEADER, secret);
  }

  if (init?.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(input, { ...init, headers });

  if (isMutation && typeof window !== 'undefined') {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('shoplog:write-locked', { detail: { reason: 'locked' } }));
    } else if (res.status === 503) {
      window.dispatchEvent(
        new CustomEvent('shoplog:write-locked', { detail: { reason: 'misconfigured' } })
      );
    }
  }

  return res;
}
