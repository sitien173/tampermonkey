import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gmGet, gmSet, gmDelete, gmMenu, gmCookie, gmXhr, GmHttpError, GmNetworkError } from './gm';

describe('gm.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('GM storage helpers', () => {
    it('gmGet returns value when GM_getValue is defined', async () => {
      vi.stubGlobal('GM_getValue', vi.fn((key, def) => (key === 'test' ? 'val' : def)));
      const res = await gmGet('test', 'default');
      expect(res).toBe('val');
    });

    it('gmGet throws when GM_getValue is undefined', async () => {
      await expect(gmGet('test', 'default')).rejects.toThrow('GM_getValue is not available');
    });

    it('gmSet sets value when GM_setValue is defined', async () => {
      const mockSet = vi.fn();
      vi.stubGlobal('GM_setValue', mockSet);
      await gmSet('test', 'val');
      expect(mockSet).toHaveBeenCalledWith('test', 'val');
    });

    it('gmSet throws when GM_setValue is undefined', async () => {
      await expect(gmSet('test', 'val')).rejects.toThrow('GM_setValue is not available');
    });

    it('gmDelete deletes value when GM_deleteValue is defined', async () => {
      const mockDelete = vi.fn();
      vi.stubGlobal('GM_deleteValue', mockDelete);
      await gmDelete('test');
      expect(mockDelete).toHaveBeenCalledWith('test');
    });

    it('gmDelete throws when GM_deleteValue is undefined', async () => {
      await expect(gmDelete('test')).rejects.toThrow('GM_deleteValue is not available');
    });
  });

  describe('gmMenu', () => {
    it('registers menu command when GM_registerMenuCommand is defined', () => {
      const mockReg = vi.fn();
      vi.stubGlobal('GM_registerMenuCommand', mockReg);
      const fn = () => {};
      gmMenu('caption', fn);
      expect(mockReg).toHaveBeenCalledWith('caption', fn);
    });

    it('logs error when GM_registerMenuCommand is undefined', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      gmMenu('caption', () => {});
      expect(errSpy).toHaveBeenCalledWith('GM_registerMenuCommand is not available');
    });
  });

  describe('gmCookie', () => {
    it('list resolves cookies from GM_cookie.list', async () => {
      const mockList = vi.fn((_details, cb) => cb([{ name: 'c1', value: 'v1' }], null));
      vi.stubGlobal('GM_cookie', { list: mockList });
      const res = await gmCookie.list({ domain: 'udemy.com' });
      expect(res).toEqual([{ name: 'c1', value: 'v1' }]);
    });

    it('list rejects on error from GM_cookie.list', async () => {
      const mockList = vi.fn((_details, cb) => cb(null, new Error('list err')));
      vi.stubGlobal('GM_cookie', { list: mockList });
      await expect(gmCookie.list()).rejects.toThrow('list err');
    });

    it('list rejects when GM_cookie is undefined', async () => {
      await expect(gmCookie.list()).rejects.toThrow('GM_cookie.list is not available');
    });

    it('set resolves on GM_cookie.set success', async () => {
      const mockSet = vi.fn((_details, cb) => cb(null));
      vi.stubGlobal('GM_cookie', { set: mockSet });
      await expect(gmCookie.set({ name: 'c1', value: 'v1', url: 'https://udemy.com' })).resolves.toBeUndefined();
    });

    it('set rejects when GM_cookie is undefined', async () => {
      await expect(gmCookie.set({ name: 'c1', value: 'v1', url: 'https://udemy.com' })).rejects.toThrow(
        'GM_cookie.set is not available'
      );
    });

    it('delete resolves on GM_cookie.delete success', async () => {
      const mockDel = vi.fn((_details, cb) => cb(null));
      vi.stubGlobal('GM_cookie', { delete: mockDel });
      await expect(gmCookie.delete({ name: 'c1', url: 'https://udemy.com' })).resolves.toBeUndefined();
    });

    it('delete rejects when GM_cookie is undefined', async () => {
      await expect(gmCookie.delete({ name: 'c1', url: 'https://udemy.com' })).rejects.toThrow(
        'GM_cookie.delete is not available'
      );
    });
  });

  describe('gmXhr', () => {
    it('resolves parsed JSON on 2xx status', async () => {
      vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details) => {
        details.onload({
          status: 200,
          statusText: 'OK',
          responseText: JSON.stringify({ hello: 'world' }),
          responseHeaders: '',
        });
      }));

      const res = await gmXhr<{ hello: string }>('GET', 'https://example.com');
      expect(res).toEqual({ hello: 'world' });
    });

    it('rejects with GmHttpError on non-2xx status preserving status and statusText', async () => {
      vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details) => {
        details.onload({
          status: 404,
          statusText: 'Not Found',
          responseText: 'page not found',
          responseHeaders: 'content-type: text/plain',
        });
      }));

      await expect(gmXhr('GET', 'https://example.com')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(GmHttpError);
        const httpErr = err as GmHttpError;
        expect(httpErr.status).toBe(404);
        expect(httpErr.statusText).toBe('Not Found');
        expect(httpErr.responseText).toBe('page not found');
        return true;
      });
    });

    it('rejects on invalid JSON response', async () => {
      vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details) => {
        details.onload({
          status: 200,
          statusText: 'OK',
          responseText: 'invalid json',
          responseHeaders: '',
        });
      }));

      await expect(gmXhr('GET', 'https://example.com')).rejects.toThrow('Failed to parse response: invalid json');
    });

    it('rejects with GmNetworkError on network onerror', async () => {
      vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details) => {
        details.onerror(new Error('Network failure'));
      }));

      await expect(gmXhr('GET', 'https://example.com')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(GmNetworkError);
        expect((err as Error).message).toBe('Network failure');
        return true;
      });
    });

    it('rejects with GmNetworkError on timeout', async () => {
      vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details) => {
        details.ontimeout();
      }));

      await expect(gmXhr('GET', 'https://example.com')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(GmNetworkError);
        expect((err as Error).message).toBe('Request timed out');
        return true;
      });
    });

    it('rejects with GmNetworkError when GM_xmlhttpRequest is undefined', async () => {
      await expect(gmXhr('GET', 'https://example.com')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(GmNetworkError);
        expect((err as Error).message).toBe('GM_xmlhttpRequest is not available');
        return true;
      });
    });
  });
});
