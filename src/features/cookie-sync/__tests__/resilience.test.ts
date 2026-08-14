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
    expect(autoCheckOnSyncFailureMock).toHaveBeenCalledWith('www.udemy.com');
    expect(reloadAfterCookieImport).not.toHaveBeenCalled();
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
});
