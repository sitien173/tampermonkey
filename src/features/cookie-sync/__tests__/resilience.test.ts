import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../../../state/store';
import { useCookieSync } from '../useCookieSync';
import { SyncTriggerProvider, useSyncTrigger } from '../SyncTriggerContext';

const { autoCheckOnSyncFailureMock } = vi.hoisted(() => ({
  autoCheckOnSyncFailureMock: vi.fn(),
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
    autoCheckOnSyncFailureMock.mockReset();
    vi.stubGlobal(
      'GM_getValue',
      vi.fn(() => ({
        licenseKey: 'license-key',
        retryAttempts: 1,
        apiKey: 'api-key',
      }))
    );
    vi.stubGlobal('GM_setValue', vi.fn());

    vi.mocked(getCurrentUdemyHost).mockReturnValue('www.udemy.com');
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
    vi.mocked(gmCookie.delete).mockResolvedValue();
  });

  it('syncs hostOnly cookies without forwarding domain', async () => {
    vi.mocked(gmCookie.set).mockImplementation(async (details) => {
      if ('domain' in details && details.domain) {
        throw new Error('Failed to parse or set cookie named "ud_cache_marketplace_country"');
      }
    });

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(screen.getByTestId('error').textContent).toBe('');
  });

  it('continues syncing after a single cookie set failure', async () => {
    vi.mocked(fetchCookiesBySource).mockResolvedValue({
      ok: true,
      data: Array.from({ length: 5 }, (_, index) => ({
        name: `cookie-${index + 1}`,
        value: `value-${index + 1}`,
        domain: 'www.udemy.com',
        path: '/',
        secure: true,
      })),
    });

    let callCount = 0;
    vi.mocked(gmCookie.set).mockImplementation(async () => {
      callCount += 1;
      if (callCount === 3) {
        throw new Error('Failed to parse or set cookie named "cookie-3"');
      }
    });

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(vi.mocked(gmCookie.set)).toHaveBeenCalledTimes(5);
    expect(screen.getByTestId('lastResult').textContent).toContain('1 skipped');
    expect(screen.getByTestId('error').textContent).toBe('');
  });

  it('invokes healthy-domain auto-check once after retries are exhausted', async () => {
    vi.mocked(fetchCookieSources).mockResolvedValue({
      ok: false,
      error: 'source fetch failed',
    });

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('error');
    });

    expect(autoCheckOnSyncFailureMock).toHaveBeenCalledTimes(1);
    expect(autoCheckOnSyncFailureMock).toHaveBeenCalledWith('www.udemy.com');
  });

  it('does not invoke healthy-domain auto-check on successful sync', async () => {
    vi.mocked(gmCookie.set).mockResolvedValue();

    render(React.createElement(AppStateProvider, undefined, React.createElement(CookieSyncHarness)));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ok');
    });

    expect(autoCheckOnSyncFailureMock).not.toHaveBeenCalled();
  });

  it('SyncTriggerProvider publishes triggerSync which invokes the inner sync pipeline', async () => {
    const TestConsumer: React.FC = () => {
      const { triggerSync } = useSyncTrigger();
      return React.createElement('button', {
        'data-testid': 'trigger-btn',
        onClick: () => {
          triggerSync();
        }
      }, 'Trigger');
    };

    render(
      React.createElement(
        AppStateProvider,
        undefined,
        React.createElement(
          SyncTriggerProvider,
          undefined,
          React.createElement(TestConsumer)
        )
      )
    );

    // Initial load: useCookieSync triggers sync automatically on mount (because SyncTriggerProvider calls it).
    // Let's clear mock calls before we click
    await waitFor(() => {
      expect(vi.mocked(fetchCookieSources)).toHaveBeenCalled();
    });
    vi.mocked(fetchCookieSources).mockClear();

    // Now click the trigger button
    const btn = screen.getByTestId('trigger-btn');
    btn.click();

    // Check if fetchCookieSources is called again
    await waitFor(() => {
      expect(vi.mocked(fetchCookieSources)).toHaveBeenCalledTimes(1);
    });
  });
});
