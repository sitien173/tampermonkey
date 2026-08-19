import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../../../state/store';
import { useCookieSync, resetSyncPipelineForTest } from '../useCookieSync';

const { autoCheckOnSyncFailureMock, clearDomainSwitchStateMock } = vi.hoisted(() => ({
  autoCheckOnSyncFailureMock: vi.fn(),
  clearDomainSwitchStateMock: vi.fn(),
}));

vi.mock('../../../lib/host', () => ({
  getCurrentUdemyHost: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  fetchCookieSources: vi.fn(),
  fetchCookiesBySource: vi.fn(),
}));

vi.mock('../../../lib/gm', () => ({
  gmCookie: {
    list: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../reload', () => ({
  reloadAfterCookieImport: vi.fn(),
}));

vi.mock('../auth-probe', () => ({
  probeAuth: vi.fn(),
}));

vi.mock('../../healthy-domain/switch', () => ({
  clearDomainSwitchState: clearDomainSwitchStateMock,
}));

vi.mock('../../healthy-domain/useHealthyDomainSwitch', () => ({
  useHealthyDomainSwitch: vi.fn(() => ({
    status: 'idle',
    snapshot: null,
    error: null,
    switchNow: vi.fn(),
    autoCheckOnSyncFailure: autoCheckOnSyncFailureMock,
  })),
}));

import { getCurrentUdemyHost } from '../../../lib/host';
import { fetchCookieSources, fetchCookiesBySource } from '../../../lib/api';
import { gmCookie } from '../../../lib/gm';
import { probeAuth } from '../auth-probe';
import { reloadAfterCookieImport } from '../reload';

const StateInspector: React.FC = () => {
  const { state } = useAppState();
  return React.createElement(
    'div',
    undefined,
    React.createElement('div', { 'data-testid': 'phase' }, state.sync.phase),
    React.createElement('div', { 'data-testid': 'lastResult' }, state.sync.lastResult ?? ''),
    React.createElement('div', { 'data-testid': 'error' }, state.sync.error ?? '')
  );
};

const CookieSyncHarness: React.FC = () => {
  useCookieSync();
  return React.createElement(StateInspector);
};

describe('useCookieSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(probeAuth).mockReset();
    vi.mocked(fetchCookieSources).mockReset();
    vi.mocked(fetchCookiesBySource).mockReset();
    vi.mocked(gmCookie.list).mockReset();
    vi.mocked(gmCookie.set).mockReset();
    vi.mocked(gmCookie.delete).mockReset();
    vi.mocked(getCurrentUdemyHost).mockReset();
    resetSyncPipelineForTest();
    autoCheckOnSyncFailureMock.mockReset();
    clearDomainSwitchStateMock.mockReset();

    vi.stubGlobal(
      'GM_getValue',
      vi.fn(() => ({
        licenseKey: 'license-key',
        apiKey: 'api-key',
      }))
    );
    vi.stubGlobal('GM_setValue', vi.fn());

    vi.mocked(getCurrentUdemyHost).mockReturnValue('www.udemy.com');
    vi.mocked(probeAuth).mockResolvedValue({ kind: 'authenticated', status: 200 });
    vi.mocked(fetchCookieSources).mockResolvedValue({
      ok: true,
      data: {
        domains: [{ host: 'www.udemy.com', cookieFileIds: ['0'] }],
      },
    });
    vi.mocked(fetchCookiesBySource).mockResolvedValue({
      ok: true,
      data: [
        {
          name: 'ud_cache_marketplace_country',
          value: 'VN',
          domain: 'www.udemy.com',
          path: '/',
          secure: true,
          hostOnly: true,
        } as any,
      ],
    });
    vi.mocked(gmCookie.list).mockResolvedValue([]);
    vi.mocked(gmCookie.set).mockResolvedValue();
    vi.mocked(gmCookie.delete).mockResolvedValue();
  });

  it('skips server cookie reads and mutations on auth-probe 2xx', async () => {
    vi.mocked(probeAuth).mockResolvedValueOnce({ kind: 'authenticated', status: 200 });

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(probeAuth).toHaveBeenCalledTimes(1);
    expect(probeAuth).toHaveBeenCalledWith('www.udemy.com');
    expect(clearDomainSwitchStateMock).toHaveBeenCalledTimes(1);
    expect(fetchCookieSources).not.toHaveBeenCalled();
    expect(fetchCookiesBySource).not.toHaveBeenCalled();
    expect(gmCookie.set).not.toHaveBeenCalled();
    expect(gmCookie.delete).not.toHaveBeenCalled();
    expect(screen.getByTestId('lastResult').textContent).toBe('Session is authenticated');
  });

  it('imports cookies when auth-probe reports expired session (non-2xx)', async () => {
    vi.mocked(probeAuth)
      .mockResolvedValueOnce({ kind: 'expired', status: 401 }) // Initial probe
      .mockResolvedValueOnce({ kind: 'authenticated', status: 200 }); // Post-import probe

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(probeAuth).toHaveBeenCalledTimes(2);
    expect(fetchCookieSources).toHaveBeenCalledWith('www.udemy.com');
    expect(fetchCookiesBySource).toHaveBeenCalledWith('www.udemy.com', '0');
    expect(gmCookie.set).toHaveBeenCalledTimes(1);
    expect(clearDomainSwitchStateMock).toHaveBeenCalledTimes(1);
    expect(reloadAfterCookieImport).toHaveBeenCalledWith(1);
  });

  it('imports cookies when auth-probe reports redirect', async () => {
    vi.mocked(probeAuth)
      .mockResolvedValueOnce({ kind: 'expired', status: 302 }) // Initial probe
      .mockResolvedValueOnce({ kind: 'authenticated', status: 200 }); // Post-import probe

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(fetchCookieSources).toHaveBeenCalledTimes(1);
    expect(gmCookie.set).toHaveBeenCalledTimes(1);
  });

  it('shows error on exhausted network probe failures without importing cookies or auto-switching', async () => {
    vi.mocked(probeAuth).mockResolvedValueOnce({
      kind: 'network_error',
      error: 'Network connection failed',
    });

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('error');
    });

    expect(screen.getByTestId('error').textContent).toBe('Network connection failed');
    expect(fetchCookieSources).not.toHaveBeenCalled();
    expect(fetchCookiesBySource).not.toHaveBeenCalled();
    expect(gmCookie.set).not.toHaveBeenCalled();
    expect(autoCheckOnSyncFailureMock).not.toHaveBeenCalled();
  });

  it('retries only failed cookie mutations once and does not repeat successful mutations', async () => {
    vi.mocked(probeAuth)
      .mockResolvedValueOnce({ kind: 'expired', status: 401 })
      .mockResolvedValueOnce({ kind: 'authenticated', status: 200 });

    vi.mocked(fetchCookiesBySource).mockResolvedValueOnce({
      ok: true,
      data: [
        { name: 'cookie-1', value: 'v1', domain: 'www.udemy.com', path: '/' },
        { name: 'cookie-2', value: 'v2', domain: 'www.udemy.com', path: '/' },
      ] as any,
    });

    let cookie2Attempts = 0;
    vi.mocked(gmCookie.set).mockImplementation(async (details) => {
      if (details.name === 'cookie-2') {
        cookie2Attempts++;
        if (cookie2Attempts === 1) {
          throw new Error('Failed to set cookie-2');
        }
      }
    });

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    // cookie-1 was attempted once (success)
    // cookie-2 was attempted twice (fail then success)
    expect(vi.mocked(gmCookie.set)).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('lastResult').textContent).toContain('2 cookies synchronized (2 set, 0 deleted)');
  });

  it('invokes healthy-domain auto-switch when post-import authentication verification fails', async () => {
    vi.mocked(probeAuth)
      .mockResolvedValueOnce({ kind: 'expired', status: 401 }) // Initial probe
      .mockResolvedValueOnce({ kind: 'expired', status: 401 }); // Post-import probe still expired

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('error');
    });

    expect(screen.getByTestId('error').textContent).toBe('Session authentication failed after cookie import');
    expect(autoCheckOnSyncFailureMock).toHaveBeenCalledTimes(1);
    expect(autoCheckOnSyncFailureMock).toHaveBeenCalledWith('www.udemy.com', 0);
    expect(reloadAfterCookieImport).not.toHaveBeenCalled();
  });

  it('tries the next cookie source after authentication remains expired', async () => {
    vi.mocked(fetchCookieSources).mockResolvedValueOnce({
      ok: true,
      data: {
        domains: [{ host: 'www.udemy.com', cookieFileIds: ['0', '1'] }],
      },
    });
    vi.mocked(probeAuth)
      .mockResolvedValueOnce({ kind: 'expired', status: 401 })
      .mockResolvedValueOnce({ kind: 'expired', status: 401 })
      .mockResolvedValueOnce({ kind: 'authenticated', status: 200 });

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(fetchCookiesBySource).toHaveBeenNthCalledWith(1, 'www.udemy.com', '0');
    expect(fetchCookiesBySource).toHaveBeenNthCalledWith(2, 'www.udemy.com', '1');
    expect(probeAuth).toHaveBeenCalledTimes(3);
    expect(autoCheckOnSyncFailureMock).not.toHaveBeenCalled();
  });

  it('stops on permanent cookie source failure without auto-switching', async () => {
    vi.mocked(probeAuth).mockResolvedValueOnce({ kind: 'expired', status: 401 });
    vi.mocked(fetchCookieSources).mockResolvedValueOnce({
      ok: false,
      error: 'source manifest missing',
    });

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('error');
    });

    expect(screen.getByTestId('error').textContent).toBe('source manifest missing');
    expect(autoCheckOnSyncFailureMock).not.toHaveBeenCalled();
    expect(reloadAfterCookieImport).not.toHaveBeenCalled();
  });

  it('shows error without auto-switching when post-import auth probe hits network error', async () => {
    vi.mocked(probeAuth)
      .mockResolvedValueOnce({ kind: 'expired', status: 401 }) // Initial probe
      .mockResolvedValueOnce({ kind: 'network_error', error: 'Network connection failed' });

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('error');
    });

    expect(screen.getByTestId('error').textContent).toBe('Network connection failed');
    expect(autoCheckOnSyncFailureMock).not.toHaveBeenCalled();
    expect(reloadAfterCookieImport).not.toHaveBeenCalled();
  });

  it('shares one in-flight pipeline across duplicate component mounts', async () => {
    vi.mocked(probeAuth).mockResolvedValue({ kind: 'authenticated', status: 200 });

    const DoubleHarness: React.FC = () => {
      useCookieSync();
      useCookieSync();
      return React.createElement(StateInspector);
    };

    render(React.createElement(AppStateProvider, undefined, React.createElement(DoubleHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(probeAuth).toHaveBeenCalledTimes(1);
  });

  it('restarts cookie synchronization when license scope revision changes', async () => {
    vi.mocked(probeAuth).mockResolvedValue({ kind: 'authenticated', status: 200 });

    const RestartHarness: React.FC = () => {
      const { dispatch } = useAppState();
      useCookieSync();
      return React.createElement(
        'div',
        undefined,
        React.createElement(StateInspector),
        React.createElement(
          'button',
          {
            'data-testid': 'commit-key-btn',
            onClick: () => {
              dispatch({ type: 'LICENSE_COMMIT', payload: { licenseKey: 'new-license-2' } });
            },
          },
          'Commit Key'
        )
      );
    };

    render(React.createElement(AppStateProvider, undefined, React.createElement(RestartHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(probeAuth).toHaveBeenCalledTimes(1);

    // Commit a new key, changing license revision
    screen.getByTestId('commit-key-btn').click();

    await waitFor(() => {
      expect(probeAuth).toHaveBeenCalledTimes(2);
    });
  });

  it('ignores stale cookie sync results and suppresses side effects when license revision increments in flight', async () => {
    let resolveFirstProbe: (val: any) => void;
    const firstProbePromise = new Promise<any>((resolve) => {
      resolveFirstProbe = resolve;
    });

    vi.mocked(probeAuth)
      .mockReturnValueOnce(firstProbePromise)
      .mockResolvedValueOnce({ kind: 'authenticated', status: 200 });

    const StaleHarness: React.FC = () => {
      const { dispatch } = useAppState();
      useCookieSync();
      return React.createElement(
        'div',
        undefined,
        React.createElement(StateInspector),
        React.createElement(
          'button',
          {
            'data-testid': 'commit-btn',
            onClick: () => {
              dispatch({ type: 'LICENSE_COMMIT', payload: { licenseKey: 'key-B' } });
            },
          },
          'Commit Key B'
        )
      );
    };

    render(React.createElement(AppStateProvider, undefined, React.createElement(StaleHarness)));

    // First probe started for initial key at revision 0
    expect(probeAuth).toHaveBeenCalledTimes(1);

    // Commit key B (increments revision to 1)
    screen.getByTestId('commit-btn').click();

    // Second probe starts for revision 1
    await waitFor(() => {
      expect(probeAuth).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    // Resolve first probe (revision 0) with a network error
    resolveFirstProbe!({ kind: 'network_error', error: 'Old Stale Error' });

    // Ensure phase remains 'ok' and is not overwritten with 'error'
    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });
    expect(screen.getByTestId('error').textContent).toBe('');
    expect(reloadAfterCookieImport).not.toHaveBeenCalled();
    expect(autoCheckOnSyncFailureMock).not.toHaveBeenCalled();
  });

  it('suppresses reloadAfterCookieImport when license revision increments during cookie import', async () => {
    let resolveSources: (val: any) => void;
    const sourcesPromise = new Promise<any>((resolve) => {
      resolveSources = resolve;
    });

    vi.mocked(probeAuth)
      .mockResolvedValueOnce({ kind: 'expired', status: 401 }) // Initial probe for revision 0
      .mockResolvedValueOnce({ kind: 'authenticated', status: 200 }); // Initial probe for revision 1

    vi.mocked(fetchCookieSources)
      .mockReturnValueOnce(sourcesPromise)
      .mockResolvedValueOnce({
        ok: true,
        data: {
          domains: [{ host: 'www.udemy.com', cookieFileIds: ['0'] }],
        },
      });

    const ImportStaleHarness: React.FC = () => {
      const { dispatch } = useAppState();
      useCookieSync();
      return React.createElement(
        'div',
        undefined,
        React.createElement(StateInspector),
        React.createElement(
          'button',
          {
            'data-testid': 'commit-btn',
            onClick: () => {
              dispatch({ type: 'LICENSE_COMMIT', payload: { licenseKey: 'key-B' } });
            },
          },
          'Commit Key B'
        )
      );
    };

    render(React.createElement(AppStateProvider, undefined, React.createElement(ImportStaleHarness)));

    // Initial probe runs and fails with 401, starts fetchCookieSources
    await waitFor(() => {
      expect(fetchCookieSources).toHaveBeenCalledTimes(1);
    });

    // Commit key B (revision 1)
    screen.getByTestId('commit-btn').click();

    // Pipeline 2 starts and probeAuth returns authenticated
    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    // Now resolve fetchCookieSources for pipeline 0
    resolveSources!({
      ok: true,
      data: {
        domains: [{ host: 'www.udemy.com', cookieFileIds: ['0'] }],
      },
    });

    // Wait a tick
    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    // reloadAfterCookieImport must NOT have been called
    expect(reloadAfterCookieImport).not.toHaveBeenCalled();
  });

  it('suppresses autoCheckOnSyncFailure when license revision increments before post-import probe finishes', async () => {
    let resolvePostProbe: (val: any) => void;
    const postProbePromise = new Promise<any>((resolve) => {
      resolvePostProbe = resolve;
    });

    vi.mocked(probeAuth)
      .mockResolvedValueOnce({ kind: 'expired', status: 401 }) // Call 1: Pipeline 0 initial probe
      .mockReturnValueOnce(postProbePromise) // Call 2: Pipeline 0 post-import probe
      .mockResolvedValueOnce({ kind: 'authenticated', status: 200 }); // Call 3: Pipeline 1 initial probe

    const PostProbeStaleHarness: React.FC = () => {
      const { dispatch } = useAppState();
      useCookieSync();
      return React.createElement(
        'div',
        undefined,
        React.createElement(StateInspector),
        React.createElement(
          'button',
          {
            'data-testid': 'commit-btn',
            onClick: () => {
              dispatch({ type: 'LICENSE_COMMIT', payload: { licenseKey: 'key-B' } });
            },
          },
          'Commit Key B'
        )
      );
    };

    render(React.createElement(AppStateProvider, undefined, React.createElement(PostProbeStaleHarness)));

    // Initial probe runs and cookies are set, then postProbe starts
    await waitFor(() => {
      expect(gmCookie.set).toHaveBeenCalled();
    });

    // Commit key B (revision 1)
    screen.getByTestId('commit-btn').click();

    // Second pipeline becomes ok
    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    // Resolve postProbe for revision 0 as expired
    resolvePostProbe!({ kind: 'expired', status: 401 });

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(autoCheckOnSyncFailureMock).not.toHaveBeenCalled();
    expect(reloadAfterCookieImport).not.toHaveBeenCalled();
  });
});
