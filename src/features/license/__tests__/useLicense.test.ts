import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../../../state/store';
import { useLicense } from '../useLicense';
import { validateLicense } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({
  validateLicense: vi.fn(),
}));

const LicenseInspector: React.FC = () => {
  const { status, expiresAt, warning } = useLicense();
  const { state } = useAppState();
  return React.createElement(
    'div',
    undefined,
    React.createElement('div', { 'data-testid': 'license-status' }, status),
    React.createElement('div', { 'data-testid': 'license-key' }, state.license.key),
    React.createElement('div', { 'data-testid': 'license-revision' }, state.licenseScopeRevision),
    React.createElement('div', { 'data-testid': 'expires-at' }, expiresAt ?? ''),
    React.createElement('div', { 'data-testid': 'warning' }, warning ?? '')
  );
};

const TestHarness: React.FC = () => {
  return React.createElement(
    AppStateProvider,
    undefined,
    React.createElement(LicenseInspector)
  );
};

describe('useLicense', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('GM_getValue', vi.fn(() => ({
      licenseKey: 'valid-license-key',
      apiKey: 'api-key',
    })));
    vi.stubGlobal('GM_setValue', vi.fn());
  });

  it('validates active license on mount and dispatches valid status with revision', async () => {
    vi.mocked(validateLicense).mockResolvedValueOnce({
      ok: true,
      data: { valid: true, expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30 },
    });

    render(React.createElement(TestHarness));

    await waitFor(() => {
      expect(screen.getByTestId('license-status').textContent).toBe('valid');
    });

    expect(validateLicense).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('license-key').textContent).toBe('valid-license-key');
  });

  it('sets status to invalid when license key is empty without calling API', async () => {
    vi.stubGlobal('GM_getValue', vi.fn(() => ({
      licenseKey: '',
      apiKey: 'api-key',
    })));

    render(React.createElement(TestHarness));

    await waitFor(() => {
      expect(screen.getByTestId('license-status').textContent).toBe('invalid');
    });

    expect(validateLicense).not.toHaveBeenCalled();
  });

  it('ignores late validation result from older revision when license changes in flight', async () => {
    let resolveFirstValidation: (val: any) => void;
    const firstValidationPromise = new Promise<any>((resolve) => {
      resolveFirstValidation = resolve;
    });

    vi.mocked(validateLicense)
      .mockReturnValueOnce(firstValidationPromise)
      .mockResolvedValueOnce({
        ok: true,
        data: { valid: true, expiresAt: Math.floor(Date.now() / 1000) + 86400 * 10 },
      });

    const HarnessWithCommit: React.FC = () => {
      const { dispatch } = useAppState();
      return React.createElement(
        'div',
        undefined,
        React.createElement(LicenseInspector),
        React.createElement(
          'button',
          {
            'data-testid': 'commit-btn',
            onClick: () => {
              dispatch({ type: 'LICENSE_COMMIT', payload: { licenseKey: 'new-key-b' } });
            },
          },
          'Commit'
        )
      );
    };

    render(
      React.createElement(
        AppStateProvider,
        undefined,
        React.createElement(HarnessWithCommit)
      )
    );

    // Initial mount started validation for 'valid-license-key' at revision 0
    expect(validateLicense).toHaveBeenCalledTimes(1);

    // User commits new key B (increments revision to 1)
    screen.getByTestId('commit-btn').click();

    await waitFor(() => {
      expect(screen.getByTestId('license-revision').textContent).toBe('1');
    });

    // Resolve first validation (revision 0) with a different status
    resolveFirstValidation!({
      ok: true,
      data: { valid: true, expiresAt: 99999999 },
    });

    // Wait and verify the late response from revision 0 did not overwrite revision 1 state
    await waitFor(() => {
      expect(screen.getByTestId('license-key').textContent).toBe('new-key-b');
    });

    expect(screen.getByTestId('license-status').textContent).toBe('valid');
    // It should have validation from the second call, not 99999999
    expect(screen.getByTestId('expires-at').textContent).not.toBe('99999999');
  });

  it('surfaces warning when license expires within 7 days', async () => {
    const nearExpiryUnix = Math.floor(Date.now() / 1000) + 86400 * 3; // 3 days left
    vi.mocked(validateLicense).mockResolvedValueOnce({
      ok: true,
      data: { valid: true, expiresAt: nearExpiryUnix },
    });

    render(React.createElement(TestHarness));

    await waitFor(() => {
      expect(screen.getByTestId('warning').textContent).toContain('expires in 3 days');
    });
  });
});
