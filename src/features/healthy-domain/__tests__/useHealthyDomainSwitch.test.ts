import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../../../state/store';

vi.mock('../../../lib/api', () => ({
  fetchCookieHealth: vi.fn(),
}));

vi.mock('../../../lib/host', () => ({
  getCurrentUdemyHost: vi.fn(),
}));

vi.mock('../cookie-cleanup', () => ({
  cleanupCookiesForHost: vi.fn().mockResolvedValue(undefined),
}));

import { fetchCookieHealth } from '../../../lib/api';
import { getCurrentUdemyHost } from '../../../lib/host';
import { cleanupCookiesForHost } from '../cookie-cleanup';
import * as healthyDomain from '../useHealthyDomainSwitch';

const HookHarness: React.FC = () => {
  const { status, snapshot, error, switchNow, autoCheckOnSyncFailure } =
    healthyDomain.useHealthyDomainSwitch();
  const { state } = useAppState();

  return React.createElement(
    'div',
    undefined,
    React.createElement('div', { 'data-testid': 'status' }, status),
    React.createElement('div', { 'data-testid': 'error' }, error ?? ''),
    React.createElement('div', { 'data-testid': 'snapshot' }, snapshot ? snapshot.domains.length : 0),
    React.createElement(
      'div',
      { 'data-testid': 'notice' },
      state.sync.notice ? `${state.sync.notice.kind}:${state.sync.notice.text}` : ''
    ),
    React.createElement('button', { onClick: () => void switchNow() }, 'switch-now'),
    React.createElement(
      'button',
      { onClick: () => void autoCheckOnSyncFailure('www.udemy.com') },
      'auto-switch'
    )
  );
};

let gmStorage: Record<string, any> = {};

function renderHarness(configOverride?: Partial<{ licenseKey: string; apiKey: string }>) {
  vi.stubGlobal(
    'GM_getValue',
    vi.fn((key: string, defaultVal: any) => {
      return gmStorage[key] !== undefined ? gmStorage[key] : (key === 'config' ? {
        licenseKey: 'license-key',
        apiKey: 'api-key',
        ...configOverride,
      } : defaultVal);
    })
  );
  vi.stubGlobal('GM_setValue', vi.fn((key: string, val: any) => {
    gmStorage[key] = val;
  }));
  vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => {
    delete gmStorage[key];
  }));

  return render(React.createElement(AppStateProvider, undefined, React.createElement(HookHarness)));
}

describe('useHealthyDomainSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gmStorage = {};
    vi.mocked(getCurrentUdemyHost).mockReturnValue('www.udemy.com');
    vi.mocked(cleanupCookiesForHost).mockResolvedValue(undefined);
  });

  it('redirects to a healthy host on switchNow after cookie cleanup', async () => {
    vi.mocked(fetchCookieHealth).mockResolvedValue({
      ok: true,
      data: {
        runAt: '2026-06-11T00:00:00Z',
        domains: [
          { host: 'www.udemy.com', status: 'down', lastChecked: null },
          { host: 'business.udemy.com', status: 'healthy', lastChecked: null },
        ],
      },
    });

    const redirectSpy = vi.spyOn(healthyDomain.locationRedirect, 'assign').mockImplementation(() => {});

    renderHarness();
    fireEvent.click(screen.getByText('switch-now'));

    const expectedUrl = new URL(window.location.href);
    expectedUrl.host = 'business.udemy.com';

    await waitFor(() => {
      expect(cleanupCookiesForHost).toHaveBeenCalledWith('www.udemy.com');
      expect(redirectSpy).toHaveBeenCalledWith(expectedUrl.toString());
    });
  });

  it('blocks navigation and displays notice if cookie cleanup fails on switchNow', async () => {
    vi.mocked(fetchCookieHealth).mockResolvedValue({
      ok: true,
      data: {
        runAt: '2026-06-11T00:00:00Z',
        domains: [
          { host: 'www.udemy.com', status: 'down', lastChecked: null },
          { host: 'business.udemy.com', status: 'healthy', lastChecked: null },
        ],
      },
    });

    vi.mocked(cleanupCookiesForHost).mockRejectedValueOnce(
      new Error('Failed to clean up 1 cookie(s) for www.udemy.com: token')
    );

    const redirectSpy = vi.spyOn(healthyDomain.locationRedirect, 'assign').mockImplementation(() => {});

    renderHarness();
    fireEvent.click(screen.getByText('switch-now'));

    await waitFor(() => {
      expect(screen.getByTestId('notice').textContent).toContain(
        'Failed to clean up cookies before domain switch'
      );
    });

    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('sets unreachable status when health fetch fails and does not redirect', async () => {
    vi.mocked(fetchCookieHealth).mockResolvedValue({
      ok: false,
      error: 'network down',
    });

    const redirectSpy = vi.spyOn(healthyDomain.locationRedirect, 'assign').mockImplementation(() => {});

    renderHarness();
    fireEvent.click(screen.getByText('switch-now'));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unreachable');
    });

    expect(screen.getByTestId('error').textContent).toBe('network down');
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('does not redirect on auto-check when no healthy non-current host exists', async () => {
    vi.mocked(fetchCookieHealth).mockResolvedValue({
      ok: true,
      data: {
        runAt: '2026-06-11T00:00:00Z',
        domains: [{ host: 'www.udemy.com', status: 'healthy', lastChecked: null }],
      },
    });

    const redirectSpy = vi.spyOn(healthyDomain.locationRedirect, 'assign').mockImplementation(() => {});

    renderHarness();
    fireEvent.click(screen.getByText('auto-switch'));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ok');
    });

    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('performs cookie cleanup before auto-switch redirect', async () => {
    vi.mocked(fetchCookieHealth).mockResolvedValue({
      ok: true,
      data: {
        runAt: '2026-06-11T00:00:00Z',
        domains: [
          { host: 'www.udemy.com', status: 'down', lastChecked: null },
          { host: 'business.udemy.com', status: 'healthy', lastChecked: null },
        ],
      },
    });

    const redirectSpy = vi.spyOn(healthyDomain.locationRedirect, 'assign').mockImplementation(() => {});

    renderHarness();
    fireEvent.click(screen.getByText('auto-switch'));

    await waitFor(() => {
      expect(cleanupCookiesForHost).toHaveBeenCalledWith('www.udemy.com');
      expect(redirectSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks second auto redirect to same target via GM loop guard, but permits manual switchNow', async () => {
    vi.mocked(fetchCookieHealth).mockResolvedValue({
      ok: true,
      data: {
        runAt: '2026-06-11T00:00:00Z',
        domains: [
          { host: 'www.udemy.com', status: 'down', lastChecked: null },
          { host: 'business.udemy.com', status: 'healthy', lastChecked: null },
        ],
      },
    });

    const redirectSpy = vi.spyOn(healthyDomain.locationRedirect, 'assign').mockImplementation(() => {});

    renderHarness();
    fireEvent.click(screen.getByText('auto-switch'));
    await waitFor(() => {
      expect(redirectSpy).toHaveBeenCalledTimes(1);
    });

    // Second auto-switch: target business.udemy.com is now visited in GM storage -> blocked
    fireEvent.click(screen.getByText('auto-switch'));
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ok');
    });
    expect(redirectSpy).toHaveBeenCalledTimes(1);

    // Manual switchNow: always starts a fresh flow
    fireEvent.click(screen.getByText('switch-now'));
    await waitFor(() => {
      expect(redirectSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('does nothing for auto-check when the license key is empty', async () => {
    const redirectSpy = vi.spyOn(healthyDomain.locationRedirect, 'assign').mockImplementation(() => {});

    renderHarness({ licenseKey: '' });
    fireEvent.click(screen.getByText('auto-switch'));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('idle');
    });

    expect(fetchCookieHealth).not.toHaveBeenCalled();
    expect(redirectSpy).not.toHaveBeenCalled();
  });
});
