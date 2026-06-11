import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateProvider } from '../../../state/store';

vi.mock('../../../lib/api', () => ({
  fetchCookieHealth: vi.fn(),
}));

vi.mock('../../../lib/host', () => ({
  getCurrentUdemyHost: vi.fn(),
}));

import { fetchCookieHealth } from '../../../lib/api';
import { getCurrentUdemyHost } from '../../../lib/host';
import * as healthyDomain from '../useHealthyDomainSwitch';

const HookHarness: React.FC = () => {
  const { status, snapshot, error, switchNow, autoCheckOnSyncFailure } =
    healthyDomain.useHealthyDomainSwitch();

  return React.createElement(
    'div',
    undefined,
    React.createElement('div', { 'data-testid': 'status' }, status),
    React.createElement('div', { 'data-testid': 'error' }, error ?? ''),
    React.createElement('div', { 'data-testid': 'snapshot' }, snapshot ? snapshot.domains.length : 0),
    React.createElement('button', { onClick: () => void switchNow() }, 'switch-now'),
    React.createElement(
      'button',
      { onClick: () => void autoCheckOnSyncFailure('www.udemy.com') },
      'auto-switch'
    )
  );
};

function renderHarness(configOverride?: Partial<{ licenseKey: string; retryAttempts: number; apiKey: string }>) {
  vi.stubGlobal(
    'GM_getValue',
    vi.fn(() => ({
      licenseKey: 'license-key',
      retryAttempts: 1,
      apiKey: 'api-key',
      ...configOverride,
    }))
  );
  vi.stubGlobal('GM_setValue', vi.fn());

  return render(React.createElement(AppStateProvider, undefined, React.createElement(HookHarness)));
}

describe('useHealthyDomainSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    vi.mocked(getCurrentUdemyHost).mockReturnValue('www.udemy.com');
  });

  it('redirects to a healthy host on switchNow', async () => {
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
      expect(redirectSpy).toHaveBeenCalledWith(expectedUrl.toString());
    });
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

  it('blocks a second auto redirect within 60 seconds but still allows manual switchNow', async () => {
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

    fireEvent.click(screen.getByText('auto-switch'));
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ok');
    });
    expect(redirectSpy).toHaveBeenCalledTimes(1);

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
