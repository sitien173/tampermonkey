import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probeAuth } from '../auth-probe';

describe('probeAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns authenticated on 200 OK', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      type: 'basic',
    });

    const result = await probeAuth('www.udemy.com', mockFetch as unknown as typeof fetch);

    expect(result).toEqual({ kind: 'authenticated', status: 200 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('https://www.udemy.com/api-2.0/users/me/', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
    });
  });

  it('returns authenticated on any 2xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 204,
      type: 'basic',
    });

    const result = await probeAuth('business.udemy.com', mockFetch as unknown as typeof fetch);

    expect(result).toEqual({ kind: 'authenticated', status: 204 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns expired on 401 Unauthorized', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      type: 'basic',
    });

    const result = await probeAuth('www.udemy.com', mockFetch as unknown as typeof fetch);

    expect(result).toEqual({ kind: 'expired', status: 401 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns expired on 403 Forbidden', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 403,
      type: 'basic',
    });

    const result = await probeAuth('www.udemy.com', mockFetch as unknown as typeof fetch);

    expect(result).toEqual({ kind: 'expired', status: 403 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns expired on opaqueredirect type', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 0,
      type: 'opaqueredirect',
    });

    const result = await probeAuth('www.udemy.com', mockFetch as unknown as typeof fetch);

    expect(result).toEqual({ kind: 'expired', status: 302 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns expired on 302 redirect response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 302,
      type: 'basic',
    });

    const result = await probeAuth('www.udemy.com', mockFetch as unknown as typeof fetch);

    expect(result).toEqual({ kind: 'expired', status: 302 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network failure and succeeds when retry returns response', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error 1'))
      .mockResolvedValueOnce({
        status: 200,
        type: 'basic',
      });

    const result = await probeAuth('www.udemy.com', mockFetch as unknown as typeof fetch);

    expect(result).toEqual({ kind: 'authenticated', status: 200 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries network failures twice (3 attempts total) then returns network_error', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error 1'))
      .mockRejectedValueOnce(new Error('Network error 2'))
      .mockRejectedValueOnce(new Error('Network error 3'));

    const result = await probeAuth('www.udemy.com', mockFetch as unknown as typeof fetch);

    expect(result).toEqual({
      kind: 'network_error',
      error: 'Network error 3',
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-2xx HTTP responses', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 500,
      type: 'basic',
    });

    const result = await probeAuth('www.udemy.com', mockFetch as unknown as typeof fetch);

    expect(result).toEqual({ kind: 'expired', status: 500 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
