import React from 'react';
import { useAppState } from '../../state/store';
import { LicensePanel } from '../license/LicensePanel';
import { ConfigForm } from './ConfigForm';
import { CookieHealthSection } from '../cookie-health/CookieHealthSection';
import './index.css';

export const SettingsPanel: React.FC = () => {
  const { dispatch } = useAppState();

  const handleClose = () => {
    dispatch({
      type: 'UI_TOGGLE',
      payload: { key: 'settingsOpen', value: false },
    });
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div className="settings-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-header">
          <h2 id="settings-title" className="settings-title ff-display-sm">Cookie updater settings</h2>
          <button className="settings-close-btn" onClick={handleClose} aria-label="Close settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="settings-content">
          <LicensePanel />
          <ConfigForm />
          <CookieHealthSection />
        </div>
      </div>
    </div>
  );
};
