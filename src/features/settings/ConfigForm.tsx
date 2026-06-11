import React from 'react';
import { useAppState } from '../../state/store';

export const ConfigForm: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { licenseKey, retryAttempts, apiKey } = state.config;

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    dispatch({
      type: 'CONFIG_UPDATE',
      payload: { [name]: value },
    });
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let numVal = parseInt(value, 10);
    if (isNaN(numVal)) {
      numVal = 3; // Default or leave it to input handling
    }
    // Constrain to 1-10
    numVal = Math.max(1, Math.min(10, numVal));
    dispatch({
      type: 'CONFIG_UPDATE',
      payload: { [name]: numVal },
    });
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
          value={licenseKey}
          onChange={handleTextChange}
          placeholder="Enter your license key"
        />
      </div>

      <div className="form-group">
        <label className="form-label ff-label-sm ff-fg-subdued" htmlFor="retryAttempts">Retry attempts (1-10)</label>
        <input
          type="number"
          id="retryAttempts"
          name="retryAttempts"
          className="form-input"
          value={retryAttempts}
          onChange={handleNumberChange}
          min="1"
          max="10"
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
