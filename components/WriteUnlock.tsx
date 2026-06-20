'use client';

import { useEffect, useState } from 'react';
import { DEMO_WRITE_SECRET } from '@/lib/write-gate';
import { getWriteSecret, setWriteSecret } from '@/lib/api-fetch';

export function WriteUnlock() {
  const [visible, setVisible] = useState(false);
  const [usesDemoDefault, setUsesDemoDefault] = useState(false);
  const [secret, setSecretInput] = useState('');

  useEffect(() => {
    fetch('/api/write-gate/status')
      .then((r) => r.json())
      .then((data: { mode?: string; demo_default?: boolean }) => {
        if (data.mode === 'locked' && !getWriteSecret()) {
          setUsesDemoDefault(Boolean(data.demo_default));
          setVisible(true);
        }
      })
      .catch(() => {});

    const onLocked = () => setVisible(true);
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

  const useDemoDefault = () => {
    setWriteSecret(DEMO_WRITE_SECRET);
    setVisible(false);
  };

  const message = usesDemoDefault
    ? 'Demo write access is locked. Use the default demo password or set SHOPLOG_WRITE_SECRET on Vercel.'
    : 'Enter the write secret to record sales, imports, and other changes.';

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
      {usesDemoDefault && (
        <button type="button" className="btn-secondary" style={{ padding: '4px 12px' }} onClick={useDemoDefault}>
          Use demo password
        </button>
      )}
      <button type="button" className="btn-secondary" style={{ padding: '4px 12px' }} onClick={() => setVisible(false)}>
        Dismiss
      </button>
    </div>
  );
}
