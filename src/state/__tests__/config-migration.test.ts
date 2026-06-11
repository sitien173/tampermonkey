import { describe, it, expect } from 'vitest';
import { loadStoredConfig, DEFAULT_CONFIG } from '../store';

describe('loadStoredConfig', () => {
  it('drops legacy keys (showUiButtons, showFolderOrganizer) when present in stored blob', () => {
    const stored = {
      licenseKey: 'abc',
      retryAttempts: 5,
      apiKey: 'k',
      showUiButtons: false,
      showFolderOrganizer: false,
    } as Record<string, unknown>;

    const result = loadStoredConfig(stored);

    expect(result).toEqual({
      licenseKey: 'abc',
      retryAttempts: 5,
      apiKey: 'k',
    });
    expect('showUiButtons' in result).toBe(false);
    expect('showFolderOrganizer' in result).toBe(false);
  });

  it('falls back to defaults for missing keys', () => {
    const result = loadStoredConfig({ licenseKey: 'only-license' });
    expect(result.licenseKey).toBe('only-license');
    expect(result.retryAttempts).toBe(DEFAULT_CONFIG.retryAttempts);
    expect(result.apiKey).toBe(DEFAULT_CONFIG.apiKey);
  });

  it('returns defaults when stored blob is null/undefined', () => {
    expect(loadStoredConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(loadStoredConfig(null)).toEqual(DEFAULT_CONFIG);
  });
});
