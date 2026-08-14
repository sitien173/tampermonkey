import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateLicense, fetchCookieSources, fetchCookiesBySource, isTransientStatus } from './api';
import * as gm from './gm';
import { GmHttpError, GmNetworkError } from './gm';
import { Config } from '../state/types';

// Mock the entire gm module
vi.mock('./gm', async () => {
  const actual = await vi.importActual<typeof import('./gm')>('./gm');
  return {
    ...actual,
    gmXhr: vi.fn(),
  };
});

describe('api.ts', () => {
  const dummyConfig: Config = {
    licenseKey: 'test-license',
    apiKey: 'test-api',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isTransientStatus', () => {
    it('treats undefined as non-transient (only GmNetworkError is a transient non-HTTP failure)', () => {
      expect(isTransientStatus(undefined)).toBe(false);
    });

    it('treats 408 and 429 as transient', () => {
      expect(isTransientStatus(408)).toBe(true);
      expect(isTransientStatus(429)).toBe(true);
    });

    it('treats 5xx as transient', () => {
      expect(isTransientStatus(500)).toBe(true);
      expect(isTransientStatus(502)).toBe(true);
      expect(isTransientStatus(503)).toBe(true);
      expect(isTransientStatus(504)).toBe(true);
    });

    it('treats 4xx (except 408, 429) as permanent', () => {
      expect(isTransientStatus(400)).toBe(false);
      expect(isTransientStatus(401)).toBe(false);
      expect(isTransientStatus(403)).toBe(false);
      expect(isTransientStatus(404)).toBe(false);
      expect(isTransientStatus(422)).toBe(false);
    });
  });

  describe('validateLicense', () => {
    it('should return valid on success', async () => {
      vi.mocked(gm.gmXhr).mockResolvedValueOnce({ valid: true, expiresAt: 123456789 });

      const result = await validateLicense(dummyConfig);

      expect(result).toEqual({
        ok: true,
        data: { valid: true, expiresAt: 123456789 },
        status: 200,
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

    it('should handle network/HTTP errors gracefully and preserve status', async () => {
      vi.mocked(gm.gmXhr).mockRejectedValueOnce(new GmHttpError(401, 'Unauthorized'));

      const result = await validateLicense(dummyConfig);

      expect(result).toEqual({
        ok: false,
        error: 'HTTP Error 401: Unauthorized',
        status: 401,
      });
    });
  });

  describe('fetchCookieSources', () => {
    it('returns parsed cookie sources on success', async () => {
      vi.mocked(gm.gmXhr).mockResolvedValueOnce({
        domains: [{ host: 'www.udemy.com', cookieCount: 3 }],
        fallback: { cookieCount: 1 },
      });

      const result = await fetchCookieSources('www.udemy.com');

      expect(result).toEqual({
        ok: true,
        data: {
          domains: [{ host: 'www.udemy.com', cookieFileIds: ['0', '1', '2'] }],
          fallback: { cookieFileIds: ['0'] },
        },
        status: 200,
      });
      expect(gm.gmXhr).toHaveBeenCalledTimes(1);
    });

    it('does not retry permanent 404 error and preserves status', async () => {
      vi.mocked(gm.gmXhr).mockRejectedValueOnce(new GmHttpError(404, 'Not Found'));

      const result = await fetchCookieSources('www.udemy.com');

      expect(result).toEqual({
        ok: false,
        error: 'HTTP Error 404: Not Found',
        status: 404,
      });
      expect(gm.gmXhr).toHaveBeenCalledTimes(1);
    });

    it('retries transient 500 error twice (3 attempts total) and preserves status', async () => {
      vi.mocked(gm.gmXhr)
        .mockRejectedValueOnce(new GmHttpError(500, 'Internal Server Error'))
        .mockRejectedValueOnce(new GmHttpError(500, 'Internal Server Error'))
        .mockRejectedValueOnce(new GmHttpError(500, 'Internal Server Error'));

      const result = await fetchCookieSources('www.udemy.com');

      expect(result).toEqual({
        ok: false,
        error: 'HTTP Error 500: Internal Server Error',
        status: 500,
      });
      expect(gm.gmXhr).toHaveBeenCalledTimes(3);
    });

    it('retries transient 429 error and succeeds on subsequent attempt', async () => {
      vi.mocked(gm.gmXhr)
        .mockRejectedValueOnce(new GmHttpError(429, 'Too Many Requests'))
        .mockResolvedValueOnce({
          domains: [{ host: 'www.udemy.com', cookieFileIds: ['0'] }],
        });

      const result = await fetchCookieSources('www.udemy.com');

      expect(result).toEqual({
        ok: true,
        data: {
          domains: [{ host: 'www.udemy.com', cookieFileIds: ['0'] }],
          fallback: undefined,
        },
        status: 200,
      });
      expect(gm.gmXhr).toHaveBeenCalledTimes(2);
    });

    it('retries network failure twice and fails when exhausted', async () => {
      vi.mocked(gm.gmXhr)
        .mockRejectedValueOnce(new GmNetworkError('Network offline'))
        .mockRejectedValueOnce(new GmNetworkError('Network offline'))
        .mockRejectedValueOnce(new GmNetworkError('Network offline'));

      const result = await fetchCookieSources('www.udemy.com');

      expect(result).toEqual({
        ok: false,
        error: 'Network offline',
        status: undefined,
      });
      expect(gm.gmXhr).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-HTTP parse errors', async () => {
      vi.mocked(gm.gmXhr).mockRejectedValueOnce(new Error('Failed to parse response: malformed'));

      const result = await fetchCookieSources('www.udemy.com');

      expect(result).toEqual({
        ok: false,
        error: 'Failed to parse response: malformed',
        status: undefined,
      });
      expect(gm.gmXhr).toHaveBeenCalledTimes(1);
    });

    it('retries GmNetworkError and succeeds on retry', async () => {
      vi.mocked(gm.gmXhr)
        .mockRejectedValueOnce(new GmNetworkError('Request timed out'))
        .mockResolvedValueOnce({
          domains: [{ host: 'www.udemy.com', cookieFileIds: ['0'] }],
        });

      const result = await fetchCookieSources('www.udemy.com');

      expect(result).toEqual({
        ok: true,
        data: {
          domains: [{ host: 'www.udemy.com', cookieFileIds: ['0'] }],
          fallback: undefined,
        },
        status: 200,
      });
      expect(gm.gmXhr).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchCookiesBySource', () => {
    it('retries 503 error and succeeds on retry', async () => {
      vi.mocked(gm.gmXhr)
        .mockRejectedValueOnce(new GmHttpError(503, 'Service Unavailable'))
        .mockResolvedValueOnce([
          { name: 'session', value: '123', domain: 'www.udemy.com' },
        ]);

      const result = await fetchCookiesBySource('www.udemy.com', '0');

      expect(result).toEqual({
        ok: true,
        data: [{ name: 'session', value: '123', domain: 'www.udemy.com' }],
        status: 200,
      });
      expect(gm.gmXhr).toHaveBeenCalledTimes(2);
    });

    it('does not retry permanent 401 error', async () => {
      vi.mocked(gm.gmXhr).mockRejectedValueOnce(new GmHttpError(401, 'Unauthorized'));

      const result = await fetchCookiesBySource('www.udemy.com', '0');

      expect(result).toEqual({
        ok: false,
        error: 'HTTP Error 401: Unauthorized',
        status: 401,
      });
      expect(gm.gmXhr).toHaveBeenCalledTimes(1);
    });
  });
});
