import React from 'react';
import { useAppState } from '../../state/store';
import { useLicense } from './useLicense';
import './index.css';

export const LicensePanel: React.FC = () => {
  const { state } = useAppState();
  const { status, expiresAt, warning } = useLicense();
  const licenseKey = state.config.licenseKey;

  // Mask the key if it exists
  const maskedKey = licenseKey
    ? licenseKey.length > 8
      ? `${licenseKey.slice(0, 8)}••••••••`
      : '••••••••'
    : 'Not configured';

  const formatExpiryDate = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusBadgeClass = () => {
    switch (status) {
      case 'valid':
        return 'badge badge-valid ff-label-sm';
      case 'invalid':
        return 'badge badge-invalid ff-label-sm';
      case 'expired':
        return 'badge badge-expired ff-label-sm';
      case 'checking':
        return 'badge badge-checking ff-label-sm';
      default:
        return 'badge badge-unknown ff-label-sm';
    }
  };

  return (
    <div className="license-panel">
      <div className="license-panel-title ff-label-sm">License info</div>
      
      <div className="license-row">
        <span className="license-label ff-text-sm">Status</span>
        <span className={getStatusBadgeClass()}>{status}</span>
      </div>

      <div className="license-row">
        <span className="license-label ff-text-sm">License key</span>
        <span className="license-value ff-text-sm" style={{ fontFamily: 'var(--font-mono)' }}>{maskedKey}</span>
      </div>

      <div className="license-row">
        <span className="license-label ff-text-sm">Expires</span>
        <span className="license-value ff-text-sm">{formatExpiryDate(expiresAt)}</span>
      </div>

      {warning && (
        <div className="license-warning ff-text-sm">
          <svg style={{ flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>{warning}</span>
        </div>
      )}
    </div>
  );
};
