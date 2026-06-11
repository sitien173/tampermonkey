import { useEffect } from 'react';
import { useAppState } from '../../state/store';
import { validateLicense } from '../../lib/api';
import { LicenseState } from '../../state/types';

/**
 * Hook to validate license on mount and whenever config.licenseKey changes.
 * Dispatches LICENSE_STATUS actions.
 * Surfaces expiry warning when expiresAt is within 7 days.
 */
export function useLicense(): { status: LicenseState['status']; expiresAt: number | null; warning?: string } {
  const { state, dispatch } = useAppState();
  const { licenseKey } = state.config;

  useEffect(() => {
    let active = true;

    async function checkLicense() {
      if (!licenseKey) {
        dispatch({
          type: 'LICENSE_STATUS',
          payload: {
            status: 'invalid',
            expiresAt: null,
            lastValidatedAt: Date.now(),
          },
        });
        return;
      }

      dispatch({
        type: 'LICENSE_STATUS',
        payload: { status: 'checking' },
      });

      const result = await validateLicense(state.config);
      if (!active) return;

      if (result.ok) {
        const { valid, expiresAt } = result.data;
        let status: LicenseState['status'] = valid ? 'valid' : 'invalid';
        
        if (valid && expiresAt && expiresAt * 1000 < Date.now()) {
          status = 'expired';
        }

        dispatch({
          type: 'LICENSE_STATUS',
          payload: {
            status,
            expiresAt: expiresAt || null,
            lastValidatedAt: Date.now(),
          },
        });
      } else {
        dispatch({
          type: 'LICENSE_STATUS',
          payload: {
            status: 'invalid',
            expiresAt: null,
            lastValidatedAt: Date.now(),
          },
        });
      }
    }

    checkLicense();

    return () => {
      active = false;
    };
  }, [licenseKey, dispatch]);

  const { status, expiresAt } = state.license;
  let warning: string | undefined = undefined;

  if (status === 'valid' && expiresAt) {
    const expiresAtMs = expiresAt * 1000;
    const timeDiff = expiresAtMs - Date.now();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    if (timeDiff > 0 && timeDiff <= sevenDaysInMs) {
      const daysLeft = Math.ceil(timeDiff / (24 * 60 * 60 * 1000));
      warning = `License expires in ${daysLeft} days.`;
      console.warn(`[Cookie Updater] ${warning}`);
    }
  }

  return {
    status,
    expiresAt,
    warning,
  };
}
