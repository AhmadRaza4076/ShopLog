'use client';

import { useCallback, useEffect, useState } from 'react';
import { VOICE_REFRESH_EVENT } from '@/components/VoiceControl';
import type { Transaction } from '@/lib/types';

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Could not load transactions.');
      }
      setError(null);
      setTransactions(data.transactions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setTransactions([]);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(VOICE_REFRESH_EVENT, load);
    return () => window.removeEventListener(VOICE_REFRESH_EVENT, load);
  }, [load]);

  return { transactions, error, reload: load };
}
