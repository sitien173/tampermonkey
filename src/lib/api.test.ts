import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateLicense } from './api';
import * as gm from './gm';
import { Config } from '../state/types';

// Mock the entire gm module
vi.mock('./gm', () => ({
  gmXhr: vi.fn(),
}));

describe('validateLicense', () => {
  const dummyConfig: Config = {
    licenseKey: 'test-license',
    apiKey: 'test-api',
    retryAttempts: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return valid on success', async () => {
    // Setup mock response
    vi.mocked(gm.gmXhr).mockResolvedValueOnce({ valid: true, expiresAt: 123456789 });

    const result = await validateLicense(dummyConfig);

    expect(result).toEqual({
      ok: true,
      data: { valid: true, expiresAt: 123456789 },
    });
    expect(gm.gmXhr).toHaveBeenCalledWith(
      'GET',
      'https://cf-api-gateway.sitienbmt.workers.dev/udemy/v3/api/license/validate',
      {
        'X-License-Key': 'test-license',
        'X-API-Key': 'test-api',
        'Content-Type': 'application/json',
      }
    );
  });

  it('should handle API returning { error } gracefully', async () => {
    vi.mocked(gm.gmXhr).mockResolvedValueOnce({ error: 'License expired' });

    const result = await validateLicense(dummyConfig);

    expect(result).toEqual({
      ok: false,
      error: 'License expired',
    });
  });

  it('should handle network/HTTP errors gracefully', async () => {
    vi.mocked(gm.gmXhr).mockRejectedValueOnce(new Error('HTTP Error 401'));

    const result = await validateLicense(dummyConfig);

    expect(result).toEqual({
      ok: false,
      error: 'HTTP Error 401',
    });
  });
});
