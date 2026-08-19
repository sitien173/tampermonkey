import { useCallback, useState, useRef, useLayoutEffect } from 'react';
import { fetchCookieHealth } from '../../lib/api';
import { getCurrentUdemyHost } from '../../lib/host';
import { useAppState } from '../../state/store';
import { PublicHealthSnapshot } from '../../state/types';
import { cleanupCookiesForHost } from './cookie-cleanup';
import {
  buildRedirectUrl,
  canAttempt,
  pickHealthyHost,
  readDomainSwitchState,
  recordAttempt,
} from './switch';

export type HealthyDomainStatus = 'idle' | 'loading' | 'ok' | 'unreachable';

export const locationRedirect = {
  assign(url: string): void {
    window.location.href = url;
  },
};

let isSwitchingInProgress = false;

export function useHealthyDomainSwitch() {
  const { state, dispatch } = useAppState();
  const [status, setStatus] = useState<HealthyDomainStatus>('idle');
  const [snapshot, setSnapshot] = useState<PublicHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentRevisionRef = useRef(state.licenseScopeRevision);
  useLayoutEffect(() => {
    currentRevisionRef.current = state.licenseScopeRevision;
  }, [state.licenseScopeRevision]);

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
    if (isSwitchingInProgress) {
      return;
    }
    isSwitchingInProgress = true;

    try {
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

      try {
        await cleanupCookiesForHost(currentHost);
      } catch (cleanupError: any) {
        const msg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        dispatch({
          type: 'NOTICE_PUSH',
          payload: {
            kind: 'error',
            text: `Failed to clean up cookies before domain switch: ${msg}`,
          },
        });
        return;
      }

      try {
        await recordAttempt(targetHost, currentHost, { manual: true });
      } catch (stateError: any) {
        const msg = stateError instanceof Error ? stateError.message : String(stateError);
        dispatch({
          type: 'NOTICE_PUSH',
          payload: {
            kind: 'error',
            text: `Failed to record domain-switch state: ${msg}`,
          },
        });
        return;
      }

      locationRedirect.assign(redirectUrl);
    } finally {
      isSwitchingInProgress = false;
    }
  }, [dispatch, loadSnapshot]);

  const autoCheckOnSyncFailure = useCallback(
    async (currentHost: string, revision?: number) => {
      if (!state.config.licenseKey) {
        return;
      }

      if (isSwitchingInProgress) {
        return;
      }
      isSwitchingInProgress = true;

      try {
        let loopState;
        try {
          loopState = await readDomainSwitchState();
        } catch (stateError: any) {
          const msg = stateError instanceof Error ? stateError.message : String(stateError);
          console.error(`[Cookie Updater] Healthy-domain auto-switch skipped: ${msg}`);
          dispatch({
            type: 'NOTICE_PUSH',
            payload: {
              kind: 'error',
              text: `Failed to read domain-switch state: ${msg}`,
            },
            revision,
          });
          return;
        }

        const nextSnapshot = await loadSnapshot();
        const targetHost = pickHealthyHost(
          nextSnapshot,
          currentHost,
          loopState?.visitedHosts ?? []
        );

        if (!targetHost) {
          console.log('[Cookie Updater] Healthy-domain auto-switch skipped: no healthy target.');
          return;
        }

        let allowed;
        try {
          allowed = await canAttempt(targetHost, { currentHost });
        } catch (stateError: any) {
          const msg = stateError instanceof Error ? stateError.message : String(stateError);
          console.error(`[Cookie Updater] Healthy-domain auto-switch skipped: ${msg}`);
          dispatch({
            type: 'NOTICE_PUSH',
            payload: {
              kind: 'error',
              text: `Failed to read domain-switch state: ${msg}`,
            },
            revision,
          });
          return;
        }
        if (!allowed) {
          console.log('[Cookie Updater] Healthy-domain auto-switch skipped by loop guard.');
          return;
        }

        const redirectUrl = buildRedirectUrl(targetHost, window.location.href);
        if (!redirectUrl) {
          console.log('[Cookie Updater] Healthy-domain auto-switch skipped: invalid redirect URL.');
          return;
        }

        try {
          await cleanupCookiesForHost(currentHost);
        } catch (cleanupError: any) {
          const msg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          console.error(`[Cookie Updater] Cookie cleanup failed during auto-switch: ${msg}`);
          dispatch({
            type: 'NOTICE_PUSH',
            payload: {
              kind: 'error',
              text: `Failed to clean up cookies before domain switch: ${msg}`,
            },
            revision,
          });
          return;
        }

        try {
          await recordAttempt(targetHost, currentHost, { manual: false });
        } catch (stateError: any) {
          const msg = stateError instanceof Error ? stateError.message : String(stateError);
          console.error(`[Cookie Updater] Healthy-domain auto-switch skipped: ${msg}`);
          dispatch({
            type: 'NOTICE_PUSH',
            payload: {
              kind: 'error',
              text: `Failed to record domain-switch state: ${msg}`,
            },
            revision,
          });
          return;
        }

        if (revision !== undefined && revision !== currentRevisionRef.current) {
          return;
        }

        locationRedirect.assign(redirectUrl);
      } finally {
        isSwitchingInProgress = false;
      }
    },
    [dispatch, loadSnapshot, state.config.licenseKey]
  );

  return {
    status,
    snapshot,
    error,
    switchNow,
    autoCheckOnSyncFailure,
  };
}
