'use client';

import { useCallback, useEffect, useState } from 'react';
import { VOICE_REFRESH_EVENT } from '@/components/VoiceControl';
import type { InventoryRow } from '@/lib/types';

export function useInventory() {
  const [items, setItems] = useState<InventoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Could not load inventory.');
      }
      setError(null);
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(VOICE_REFRESH_EVENT, load);
    return () => window.removeEventListener(VOICE_REFRESH_EVENT, load);
  }, [load]);

  return { items, error, reload: load, setItems };
}
