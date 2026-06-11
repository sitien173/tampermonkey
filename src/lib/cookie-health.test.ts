import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCookieHealth } from './api';
import * as gm from './gm';
import { Config } from '../state/types';

// Mock the entire gm module
vi.mock('./gm', () => ({
  gmXhr: vi.fn(),
}));

describe('fetchCookieHealth', () => {
  const dummyConfig: Config = {
    licenseKey: 'test-license',
    apiKey: 'test-api',
    retryAttempts: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return health snapshot on success', async () => {
    const mockSnapshot = {
      runAt: '2026-06-11T10:00:00Z',
      domains: [
        { host: 'test.udemy.com', status: 'healthy', lastChecked: '2026-06-11T09:50:00Z' }
      ]
    };
    vi.mocked(gm.gmXhr).mockResolvedValueOnce(mockSnapshot);

    const result = await fetchCookieHealth(dummyConfig);

    expect(result).toEqual({
      ok: true,
      data: mockSnapshot,
    });
    expect(gm.gmXhr).toHaveBeenCalledWith(
      'GET',
      'https://cf-api-gateway.sitienbmt.workers.dev/udemy/v3/api/cookies/health',
      {
        'X-License-Key': 'test-license',
        'X-API-Key': 'test-api',
        'Content-Type': 'application/json',
      }
    );
  });

  it('should handle API returning { error } gracefully', async () => {
    vi.mocked(gm.gmXhr).mockResolvedValueOnce({ error: 'Unauthorized' });

    const result = await fetchCookieHealth(dummyConfig);

    expect(result).toEqual({
      ok: false,
      error: 'Unauthorized',
    });
  });

  it('should handle network/HTTP errors gracefully', async () => {
    vi.mocked(gm.gmXhr).mockRejectedValueOnce(new Error('Network down'));

    const result = await fetchCookieHealth(dummyConfig);

    expect(result).toEqual({
      ok: false,
      error: 'Network down',
    });
  });
});
