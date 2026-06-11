import { useEffect, useCallback } from 'react';
import { useAppState } from '../../state/store';
import { getCurrentUdemyHost } from '../../lib/host';
import { fetchCookieSources, fetchCookiesBySource } from '../../lib/api';
import { gmCookie } from '../../lib/gm';
import { diffCookies } from '../../lib/cookies';
import { useHealthyDomainSwitch } from '../healthy-domain/useHealthyDomainSwitch';
import { reloadAfterCookieImport } from './reload';

const DEBUG_COOKIE_SYNC = false;

export function useCookieSync(): { triggerSync: () => Promise<void> } {
  const { state, dispatch } = useAppState();
  const { autoCheckOnSyncFailure } = useHealthyDomainSwitch();
  const retryAttempts = state.config.retryAttempts;
  const licenseKey = state.config.licenseKey;

  const triggerSync = useCallback(async () => {
    const host = getCurrentUdemyHost();
    if (!host) {
      return;
    }

    if (!licenseKey) {
      console.log('[Cookie Updater] No license key configured, skipping cookie sync.');
      return;
    }

    dispatch({ type: 'SYNC_STATUS', payload: { phase: 'syncing', error: null } });

    let attempts = 0;
    const maxAttempts = Math.max(1, retryAttempts);

    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`[Cookie Updater] Cookie sync attempt ${attempts}/${maxAttempts}...`);

        // Fetch cookie sources
        const sourcesResult = await fetchCookieSources(host);
        if (!sourcesResult.ok) {
          throw new Error(sourcesResult.error);
        }

        // Find matching domain for current host (exact OrdinalIgnoreCase / case-insensitive)
        const currentHostLower = host.toLowerCase();
        const matchedDomain = sourcesResult.data.domains.find(
          (d) => d.host.toLowerCase() === currentHostLower
        );

        if (!matchedDomain) {
          throw new Error(`No matching cookie source domain found for host: ${host}`);
        }

        if (!matchedDomain.cookieFileIds || matchedDomain.cookieFileIds.length === 0) {
          throw new Error(`No cookie files configured for host: ${host}`);
        }

        // Pick first fileId from the matched domain's cookieFileIds
        const fileId = matchedDomain.cookieFileIds[0];

        // Fetch cookies by source
        const cookiesResult = await fetchCookiesBySource(host, fileId);
        if (!cookiesResult.ok) {
          throw new Error(cookiesResult.error);
        }

        const desiredCookies = cookiesResult.data;

        // List existing cookies via gmCookie.list
        const existingCookies = await gmCookie.list({ domain: host });

        // Diff cookies
        const ops = diffCookies(
          existingCookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
          })),
          desiredCookies
        );

        // Apply ops
        let setOpsCount = 0;
        let deleteOpsCount = 0;
        let skippedOpsCount = 0;

        for (const op of ops) {
          if (op.type === 'set') {
            const cookieUrl = `https://${host.replace(/^\./, '')}${op.cookie.path || '/'}`;
            const cookieDetails: Tampermonkey.SetCookiesDetails = {
              url: cookieUrl,
              name: op.cookie.name,
              value: op.cookie.value,
              domain: op.cookie.domain,
              path: op.cookie.path,
              secure: op.cookie.secure,
              httpOnly: op.cookie.httpOnly,
              expirationDate: op.cookie.expirationDate,
            };

            if (op.cookie.hostOnly) {
              delete cookieDetails.domain;
            }

            if (DEBUG_COOKIE_SYNC) {
              console.log('[Cookie Updater] DEBUG cookie set attempt', {
                name: op.cookie.name,
                value: op.cookie.value,
                domain: op.cookie.domain,
                path: op.cookie.path,
                sameSite: (op.cookie as typeof op.cookie & { sameSite?: unknown }).sameSite,
                secure: op.cookie.secure,
                httpOnly: op.cookie.httpOnly,
                expirationDate: op.cookie.expirationDate,
              });
            }

            try {
              await gmCookie.set(cookieDetails);
              setOpsCount++;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              if (DEBUG_COOKIE_SYNC) {
                console.log('[Cookie Updater] DEBUG cookie set rejection', errorMsg);
              }
              console.warn(`[Cookie Updater] cookie skipped: ${op.cookie.name} — ${errorMsg}`);
              skippedOpsCount++;
            }
          } else if (op.type === 'delete') {
            const cookieUrl = `https://${host.replace(/^\./, '')}/`;
            try {
              await gmCookie.delete({
                url: cookieUrl,
                name: op.name,
              });
              deleteOpsCount++;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.warn(`[Cookie Updater] cookie skipped: ${op.name} — ${errorMsg}`);
              skippedOpsCount++;
            }
          }
        }

        const resultMsg =
          skippedOpsCount > 0
            ? `${ops.length} cookies synchronized (${setOpsCount} set, ${deleteOpsCount} deleted, ${skippedOpsCount} skipped)`
            : `${ops.length} cookies synchronized (${setOpsCount} set, ${deleteOpsCount} deleted)`;
        dispatch({
          type: 'SYNC_STATUS',
          payload: {
            phase: 'ok',
            lastResult: resultMsg,
            error: null,
          },
        });
        console.log(`[Cookie Updater] Cookie sync completed: ${resultMsg}`);
        reloadAfterCookieImport(ops.length);
        return; // Success, exit the retry loop
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        console.error(`[Cookie Updater] Cookie sync attempt ${attempts} failed: ${errorMsg}`);
        if (attempts >= maxAttempts) {
          dispatch({
            type: 'SYNC_STATUS',
            payload: {
              phase: 'error',
              error: errorMsg,
            },
          });
          await autoCheckOnSyncFailure(host);
        } else {
          // Bounded linear delay before next attempt
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }, [licenseKey, retryAttempts, dispatch, autoCheckOnSyncFailure]);

  useEffect(() => {
    triggerSync();
  }, [triggerSync]);

  useEffect(() => {
    const originalPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
      originalPushState(...args);
      triggerSync(); // re-run sync
    };

    window.addEventListener('popstate', triggerSync);

    return () => {
      history.pushState = originalPushState;
      window.removeEventListener('popstate', triggerSync);
    };
  }, [triggerSync]);

  return { triggerSync };
}
