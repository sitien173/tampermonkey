import { useCallback, useState } from 'react';
import { fetchCookieHealth } from '../../lib/api';
import { getCurrentUdemyHost } from '../../lib/host';
import { useAppState } from '../../state/store';
import { PublicHealthSnapshot } from '../../state/types';
import { buildRedirectUrl, canAttempt, pickHealthyHost, recordAttempt } from './switch';

export type HealthyDomainStatus = 'idle' | 'loading' | 'ok' | 'unreachable';

export const locationRedirect = {
  assign(url: string): void {
    window.location.href = url;
  },
};

export function useHealthyDomainSwitch() {
  const { state, dispatch } = useAppState();
  const [status, setStatus] = useState<HealthyDomainStatus>('idle');
  const [snapshot, setSnapshot] = useState<PublicHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async (): Promise<PublicHealthSnapshot | null> => {
    if (snapshot) {
      return snapshot;
    }

    setStatus('loading');
    setError(null);

    const result = await fetchCookieHealth(state.config);
    if (result.ok) {
      setSnapshot(result.data);
      setStatus('ok');
      return result.data;
    }

    setStatus('unreachable');
    setError(result.error);
    return snapshot;
  }, [snapshot, state.config]);

  const switchNow = useCallback(async () => {
    const nextSnapshot = await loadSnapshot();
    const currentHost = getCurrentUdemyHost();
    const targetHost = pickHealthyHost(nextSnapshot, currentHost);

    if (!targetHost) {
      dispatch({
        type: 'NOTICE_PUSH',
        payload: {
          kind: 'info',
          text: 'No healthy Udemy domain available right now.',
        },
      });
      return;
    }

    const redirectUrl = buildRedirectUrl(targetHost, window.location.href);
    if (!redirectUrl) {
      dispatch({
        type: 'NOTICE_PUSH',
        payload: {
          kind: 'info',
          text: 'No healthy Udemy domain available right now.',
        },
      });
      return;
    }

    recordAttempt(targetHost);
    locationRedirect.assign(redirectUrl);
  }, [dispatch, loadSnapshot]);

  const autoCheckOnSyncFailure = useCallback(
    async (currentHost: string) => {
      if (!state.config.licenseKey) {
        return;
      }

      const nextSnapshot = await loadSnapshot();
      const targetHost = pickHealthyHost(nextSnapshot, currentHost);
      if (!targetHost) {
        console.log('[Cookie Updater] Healthy-domain auto-switch skipped: no healthy target.');
        return;
      }

      if (!canAttempt(targetHost)) {
        console.log('[Cookie Updater] Healthy-domain auto-switch skipped by loop guard.');
        return;
      }

      const redirectUrl = buildRedirectUrl(targetHost, window.location.href);
      if (!redirectUrl) {
        console.log('[Cookie Updater] Healthy-domain auto-switch skipped: invalid redirect URL.');
        return;
      }

      recordAttempt(targetHost);
      locationRedirect.assign(redirectUrl);
    },
    [loadSnapshot, state.config.licenseKey]
  );

  return {
    status,
    snapshot,
    error,
    switchNow,
    autoCheckOnSyncFailure,
  };
}
