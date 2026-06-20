import { describe, expect, it } from 'vitest';
import { DEMO_WRITE_SECRET, evaluateWriteGate, getWriteGateMode } from './write-gate';

describe('evaluateWriteGate', () => {
  it('allows local dev writes when secret is unset', () => {
    const result = evaluateWriteGate({
      pathname: '/api/seed',
      method: 'POST',
      secret: undefined,
      providedHeader: null,
      isProduction: false,
    });
    expect(result.action).toBe('allow');
  });

  it('requires demo secret in production when env secret is unset', () => {
    const denied = evaluateWriteGate({
      pathname: '/api/seed',
      method: 'POST',
      secret: undefined,
      providedHeader: null,
      isProduction: true,
    });
    expect(denied.action).toBe('deny');
    if (denied.action === 'deny') expect(denied.status).toBe(401);

    const allowed = evaluateWriteGate({
      pathname: '/api/seed',
      method: 'POST',
      secret: undefined,
      providedHeader: DEMO_WRITE_SECRET,
      isProduction: true,
    });
    expect(allowed.action).toBe('allow');
  });

  it('requires header when custom secret is configured', () => {
    const denied = evaluateWriteGate({
      pathname: '/api/transactions',
      method: 'POST',
      secret: 'test-secret',
      providedHeader: null,
      isProduction: true,
    });
    expect(denied.action).toBe('deny');
    if (denied.action === 'deny') expect(denied.status).toBe(401);

    const allowed = evaluateWriteGate({
      pathname: '/api/transactions',
      method: 'POST',
      secret: 'test-secret',
      providedHeader: 'test-secret',
      isProduction: true,
    });
    expect(allowed.action).toBe('allow');
  });

  it('exempts voice preview from write gate', () => {
    const result = evaluateWriteGate({
      pathname: '/api/voice-command/preview',
      method: 'POST',
      secret: 'test-secret',
      providedHeader: null,
      isProduction: true,
    });
    expect(result.action).toBe('allow');
  });

  it('reports locked mode on production even without env secret', () => {
    expect(getWriteGateMode(undefined, true)).toBe('locked');
    expect(getWriteGateMode(undefined, false)).toBe('open');
  });
});
