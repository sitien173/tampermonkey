import { useEffect, useLayoutEffect } from 'react';
import { useAppState } from '../../state/store';
import { getCurrentUdemyHost } from '../../lib/host';
import { fetchCookieSources, fetchCookiesBySource } from '../../lib/api';
import { gmCookie } from '../../lib/gm';
import { diffCookies, CookieOp } from '../../lib/cookies';
import { useHealthyDomainSwitch } from '../healthy-domain/useHealthyDomainSwitch';
import { clearDomainSwitchState } from '../healthy-domain/switch';
import { reloadAfterCookieImport } from './reload';
import { probeAuth } from './auth-probe';

let inFlightSyncPromise: Promise<void> | null = null;
let inFlightSyncRevision: number | null = null;
let activeRevision: number | null = null;

export function resetSyncPipelineForTest(): void {
  inFlightSyncPromise = null;
  inFlightSyncRevision = null;
  activeRevision = null;
}

async function applyCookieOp(op: CookieOp, host: string): Promise<void> {
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

    await gmCookie.set(cookieDetails);
  } else if (op.type === 'delete') {
    const cookieUrl = `https://${host.replace(/^\./, '')}${op.path || '/'}`;
    await gmCookie.delete({
      url: cookieUrl,
      name: op.name,
      domain: op.domain,
      path: op.path,
    });
  }
}

interface SyncParams {
  licenseKey: string;
  revision: number;
  dispatch: ReturnType<typeof useAppState>['dispatch'];
  autoCheckOnSyncFailure: (host: string, revision?: number) => Promise<void>;
}

async function runSyncPipeline({ licenseKey, revision, dispatch, autoCheckOnSyncFailure }: SyncParams): Promise<void> {
  const host = getCurrentUdemyHost();
  if (!host) {
    return;
  }

  if (!licenseKey) {
    console.log('[Cookie Updater] No license key configured, skipping cookie sync.');
    return;
  }

  dispatch({ type: 'SYNC_STATUS', payload: { phase: 'syncing', error: null }, revision });

  // 1. Initial auth probe
  const initialProbe = await probeAuth(host);
  if (activeRevision !== revision) return;

  if (initialProbe.kind === 'authenticated') {
    await clearDomainSwitchState();
    if (activeRevision !== revision) return;
    dispatch({
      type: 'SYNC_STATUS',
      payload: {
        phase: 'ok',
        lastResult: 'Session is authenticated',
        error: null,
      },
      revision,
    });
    return;
  }

  if (initialProbe.kind === 'network_error') {
    // Network uncertainty must not mutate cookies or trigger domain switches
    dispatch({
      type: 'SYNC_STATUS',
      payload: {
        phase: 'error',
        error: initialProbe.error,
      },
      revision,
    });
    return;
  }

  // 2. Initial probe was expired (redirect or non-2xx HTTP response) -> perform cookie import
  try {
    const sourcesResult = await fetchCookieSources(host);
    if (activeRevision !== revision) return;
    if (!sourcesResult.ok) {
      throw new Error(sourcesResult.error);
    }

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

    for (const [sourceIndex, fileId] of matchedDomain.cookieFileIds.entries()) {
      const cookiesResult = await fetchCookiesBySource(host, fileId);
      if (activeRevision !== revision) return;
      if (!cookiesResult.ok) {
        throw new Error(cookiesResult.error);
      }

      const desiredCookies = cookiesResult.data;
      const existingCookies = await gmCookie.list({ domain: host });
      if (activeRevision !== revision) return;

      const ops = diffCookies(
        existingCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
        })),
        desiredCookies
      );

      let setOpsCount = 0;
      let deleteOpsCount = 0;
      const failedOps: CookieOp[] = [];

      // Apply every operation once
      for (const op of ops) {
        if (activeRevision !== revision) return;
        try {
          await applyCookieOp(op, host);
          if (op.type === 'set') setOpsCount++;
          else if (op.type === 'delete') deleteOpsCount++;
        } catch (error: any) {
          if (error?.message && error.message.includes('not available')) {
            throw error;
          }
          console.warn(`[Cookie Updater] cookie op failed on first attempt: ${op.type === 'set' ? op.cookie.name : op.name} — ${error?.message || error}`);
          failedOps.push(op);
        }
      }

      // Retry only failed operations once
      let skippedOpsCount = 0;
      if (failedOps.length > 0) {
        for (const op of failedOps) {
          if (activeRevision !== revision) return;
          try {
            await applyCookieOp(op, host);
            if (op.type === 'set') setOpsCount++;
            else if (op.type === 'delete') deleteOpsCount++;
          } catch (error: any) {
            if (error?.message && error.message.includes('not available')) {
              throw error;
            }
            console.warn(`[Cookie Updater] cookie op failed on retry: ${op.type === 'set' ? op.cookie.name : op.name} — ${error?.message || error}`);
            skippedOpsCount++;
          }
        }
      }

      // 3. Relist cookies and probe authentication again
      await gmCookie.list({ domain: host });
      if (activeRevision !== revision) return;

      const postProbe = await probeAuth(host);
      if (activeRevision !== revision) return;

      if (postProbe.kind === 'authenticated') {
        await clearDomainSwitchState();
        if (activeRevision !== revision) return;

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
          revision,
        });
        if (activeRevision === revision) {
          reloadAfterCookieImport(ops.length);
        }
        return;
      }

      if (postProbe.kind === 'network_error') {
        dispatch({
          type: 'SYNC_STATUS',
          payload: {
            phase: 'error',
            error: postProbe.error,
          },
          revision,
        });
        return;
      }

      if (sourceIndex < matchedDomain.cookieFileIds.length - 1) {
        console.warn(`[Cookie Updater] cookie source index ${sourceIndex} did not restore authentication; trying the next source.`);
        continue;
      }
    }

    const errorMsg = 'Session authentication failed after cookie import';
    dispatch({
      type: 'SYNC_STATUS',
      payload: {
        phase: 'error',
        error: errorMsg,
      },
      revision,
    });
    if (activeRevision === revision) {
      await autoCheckOnSyncFailure(host, revision);
    }
  } catch (err: any) {
    if (activeRevision !== revision) return;
    const errorMsg = err?.message || String(err);
    console.error(`[Cookie Updater] Cookie sync failed: ${errorMsg}`);
    dispatch({
      type: 'SYNC_STATUS',
      payload: {
        phase: 'error',
        error: errorMsg,
      },
      revision,
    });
  }
}

export function useCookieSync(): void {
  const { state, dispatch } = useAppState();
  const { autoCheckOnSyncFailure } = useHealthyDomainSwitch();
  const licenseKey = state.config.licenseKey;
  const revision = state.licenseScopeRevision;

  useLayoutEffect(() => {
    activeRevision = revision;
  }, [revision]);

  useEffect(() => {
    activeRevision = revision;
    if (!licenseKey) {
      return;
    }
    if (inFlightSyncRevision !== revision || !inFlightSyncPromise) {
      inFlightSyncRevision = revision;
      inFlightSyncPromise = runSyncPipeline({
        licenseKey,
        revision,
        dispatch,
        autoCheckOnSyncFailure,
      });
    }
  }, [licenseKey, revision, dispatch, autoCheckOnSyncFailure]);
}
