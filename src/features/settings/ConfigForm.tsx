import React, { useState, useEffect } from 'react';
import { useAppState } from '../../state/store';

export const ConfigForm: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { licenseKey, apiKey } = state.config;

  const [draftLicenseKey, setDraftLicenseKey] = useState(licenseKey);

  useEffect(() => {
    setDraftLicenseKey(licenseKey);
  }, [licenseKey]);

  const commitLicenseKey = (keyToCommit: string) => {
    if (keyToCommit !== licenseKey) {
      dispatch({
        type: 'LICENSE_COMMIT',
        payload: { licenseKey: keyToCommit },
      });
    }
  };

  const handleLicenseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftLicenseKey(e.target.value);
  };

  const handleLicenseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitLicenseKey(draftLicenseKey);
    }
  };

  const handleLicenseBlur = () => {
    commitLicenseKey(draftLicenseKey);
  };

  return (
    <div className="config-form">
      <div className="form-group">
        <label className="form-label ff-label-sm ff-fg-subdued" htmlFor="licenseKey">License key</label>
        <input
          type="text"
          id="licenseKey"
          name="licenseKey"
          className="form-input"
          value={draftLicenseKey}
          onChange={handleLicenseChange}
          onKeyDown={handleLicenseKeyDown}
          onBlur={handleLicenseBlur}
          placeholder="Enter your license key"
        />
      </div>

      <div className="form-group">
        <label className="form-label ff-label-sm ff-fg-subdued" htmlFor="apiKey">API key</label>
        <input
          type="text"
          id="apiKey"
          name="apiKey"
          className="form-input form-input-disabled"
          value={apiKey}
          disabled
          title="API key is read-only"
        />
        <span className="form-help ff-caption">The API key is pre-configured and read-only.</span>
      </div>
    </div>
  );
};
