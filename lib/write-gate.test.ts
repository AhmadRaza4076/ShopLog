import { describe, expect, it } from 'vitest';
import { evaluateWriteGate, getWriteGateMode } from './write-gate';

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

  it('allows production writes when env secret is unset', () => {
    const result = evaluateWriteGate({
      pathname: '/api/seed',
      method: 'POST',
      secret: undefined,
      providedHeader: null,
      isProduction: true,
    });
    expect(result.action).toBe('allow');
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

  it('reports open mode when env secret is unset', () => {
    expect(getWriteGateMode(undefined, true)).toBe('open');
    expect(getWriteGateMode(undefined, false)).toBe('open');
    expect(getWriteGateMode('custom-secret', true)).toBe('locked');
  });
});
