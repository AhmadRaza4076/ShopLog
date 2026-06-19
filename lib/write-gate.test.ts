import { describe, expect, it } from 'vitest';
import { evaluateWriteGate } from './write-gate';

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

  it('blocks production writes when secret is unset (fail closed)', () => {
    const result = evaluateWriteGate({
      pathname: '/api/seed',
      method: 'POST',
      secret: undefined,
      providedHeader: null,
      isProduction: true,
    });
    expect(result.action).toBe('deny');
    if (result.action === 'deny') expect(result.status).toBe(503);
  });

  it('requires header when secret is configured', () => {
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
});
