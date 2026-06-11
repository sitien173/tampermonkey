import { useState, useCallback, useEffect } from 'react';
import { useAppState } from '../../state/store';
import { fetchCookieHealth } from '../../lib/api';
import { PublicHealthSnapshot } from '../../state/types';

export type CookieHealthStatus = 'idle' | 'loading' | 'ok' | 'error';

export function useCookieHealth(enabled: boolean = true) {
  const { state } = useAppState();
  const [status, setStatus] = useState<CookieHealthStatus>('idle');
  const [snapshot, setSnapshot] = useState<PublicHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    const result = await fetchCookieHealth(state.config);
    if (result.ok) {
      setSnapshot(result.data);
      setStatus('ok');
    } else {
      setError(result.error);
      setStatus('error');
    }
  }, [state.config]);

  useEffect(() => {
    if (enabled && status === 'idle') {
      refresh();
    }
  }, [enabled, status, refresh]);

  return { status, snapshot, error, refresh };
}
