'use client';

import { useEffect, useState } from 'react';
import { clearWriteSecret, getWriteSecret, setWriteSecret } from '@/lib/api-fetch';

type GateReason = 'locked' | 'misconfigured';

export function WriteUnlock() {
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<GateReason>('locked');
  const [secret, setSecretInput] = useState('');

  useEffect(() => {
    fetch('/api/write-gate/status')
      .then((r) => r.json())
      .then((data: { mode?: string }) => {
        if (data.mode === 'misconfigured') {
          setReason('misconfigured');
          setVisible(true);
        } else if (data.mode === 'locked' && !getWriteSecret()) {
          setReason('locked');
          setVisible(true);
        }
      })
      .catch(() => {});

    const onLocked = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      setReason(detail?.reason === 'misconfigured' ? 'misconfigured' : 'locked');
      setVisible(true);
    };
    window.addEventListener('shoplog:write-locked', onLocked);
    return () => window.removeEventListener('shoplog:write-locked', onLocked);
  }, []);

  if (!visible) return null;

  const handleUnlock = () => {
    if (!secret.trim()) return;
    setWriteSecret(secret);
    setVisible(false);
    setSecretInput('');
  };

  const message =
    reason === 'misconfigured'
      ? 'Writes are disabled — set SHOPLOG_WRITE_SECRET in Vercel, redeploy, then unlock here.'
      : 'Enter the demo write secret to record sales, imports, and other changes.';

  return (
    <div
      className="write-unlock-banner"
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'var(--brass)',
        color: 'var(--ink)',
        padding: '10px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
      }}
    >
      <span>{message}</span>
      {reason === 'locked' && (
        <>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Enter write secret"
            aria-label="Write secret"
            style={{ padding: '4px 8px', minWidth: 180 }}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          />
          <button type="button" className="btn-primary" style={{ padding: '4px 12px' }} onClick={handleUnlock}>
            Unlock
          </button>
        </>
      )}
      <button
        type="button"
        className="btn-secondary"
        style={{ padding: '4px 12px' }}
        onClick={() => setVisible(false)}
      >
        Dismiss
      </button>
    </div>
  );
}
