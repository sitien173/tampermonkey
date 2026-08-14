import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isCookieApplicable, buildDeleteCookieDetails, cleanupCookiesForHost } from '../cookie-cleanup';
import { gmCookie } from '../../../lib/gm';

vi.mock('../../../lib/gm', () => ({
  gmCookie: {
    list: vi.fn(),
    delete: vi.fn(),
    set: vi.fn(),
  },
}));

describe('cookie-cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isCookieApplicable', () => {
    it('matches host-only cookie when domain equals current host exactly', () => {
      expect(
        isCookieApplicable(
          { domain: 'www.udemy.com', hostOnly: true },
          'www.udemy.com'
        )
      ).toBe(true);

      expect(
        isCookieApplicable(
          { domain: 'WWW.UDEMY.COM', hostOnly: true },
          'www.udemy.com'
        )
      ).toBe(true);
    });

    it('does not match host-only cookie for parent domain or sibling host', () => {
      expect(
        isCookieApplicable(
          { domain: 'udemy.com', hostOnly: true },
          'www.udemy.com'
        )
      ).toBe(false);

      expect(
        isCookieApplicable(
          { domain: 'business.udemy.com', hostOnly: true },
          'www.udemy.com'
        )
      ).toBe(false);
    });

    it('matches parent domain cookie (.udemy.com or udemy.com) for subdomains', () => {
      expect(
        isCookieApplicable(
          { domain: '.udemy.com', hostOnly: false },
          'www.udemy.com'
        )
      ).toBe(true);

      expect(
        isCookieApplicable(
          { domain: 'udemy.com', hostOnly: false },
          'business.udemy.com'
        )
      ).toBe(true);
    });

    it('does not match sibling domain or unrelated domain', () => {
      expect(
        isCookieApplicable(
          { domain: 'business.udemy.com', hostOnly: false },
          'www.udemy.com'
        )
      ).toBe(false);

      expect(
        isCookieApplicable(
          { domain: 'example.com', hostOnly: false },
          'www.udemy.com'
        )
      ).toBe(false);
    });
  });

  describe('buildDeleteCookieDetails', () => {
    it('preserves cookie path and constructs url', () => {
      const details = buildDeleteCookieDetails({
        name: 'test_cookie',
        domain: '.udemy.com',
        path: '/course/learn',
      } as any);

      expect(details).toEqual({
        url: 'https://udemy.com/course/learn',
        name: 'test_cookie',
        domain: '.udemy.com',
        path: '/course/learn',
      });
    });

    it('defaults path to / when undefined', () => {
      const details = buildDeleteCookieDetails({
        name: 'session_id',
        domain: 'www.udemy.com',
      } as any);

      expect(details).toEqual({
        url: 'https://www.udemy.com/',
        name: 'session_id',
        domain: 'www.udemy.com',
        path: undefined,
      });
    });
  });

  describe('cleanupCookiesForHost', () => {
    it('does nothing when no applicable cookies exist', async () => {
      vi.mocked(gmCookie.list).mockResolvedValue([
        {
          name: 'other_cookie',
          domain: 'business.udemy.com',
          path: '/',
          hostOnly: true,
          value: '1',
          httpOnly: false,
          secure: true,
          session: true,
          sameSite: 'Lax',
        },
      ]);

      await cleanupCookiesForHost('www.udemy.com');

      expect(gmCookie.list).toHaveBeenCalledTimes(1);
      expect(gmCookie.delete).not.toHaveBeenCalled();
    });

    it('deletes applicable cookies with exact identity and verifies deletion', async () => {
      const applicableCookies: Tampermonkey.Cookie[] = [
        {
          name: 'access_token',
          domain: '.udemy.com',
          path: '/',
          hostOnly: false,
          value: 'tok',
          httpOnly: true,
          secure: true,
          session: false,
          sameSite: 'None',
        },
        {
          name: 'host_session',
          domain: 'www.udemy.com',
          path: '/app',
          hostOnly: true,
          value: 'hs',
          httpOnly: false,
          secure: true,
          session: true,
          sameSite: 'Lax',
        },
        {
          name: 'sibling_cookie',
          domain: 'business.udemy.com',
          path: '/',
          hostOnly: true,
          value: 'sib',
          httpOnly: false,
          secure: true,
          session: true,
          sameSite: 'Lax',
        },
      ];

      vi.mocked(gmCookie.list)
        .mockResolvedValueOnce(applicableCookies)
        .mockResolvedValueOnce([applicableCookies[2]]); // After delete, only sibling remains

      vi.mocked(gmCookie.delete).mockResolvedValue();

      await cleanupCookiesForHost('www.udemy.com');

      expect(gmCookie.delete).toHaveBeenCalledTimes(2);
      expect(gmCookie.delete).toHaveBeenCalledWith({
        url: 'https://udemy.com/',
        name: 'access_token',
        domain: '.udemy.com',
        path: '/',
      });
      expect(gmCookie.delete).toHaveBeenCalledWith({
        url: 'https://www.udemy.com/app',
        name: 'host_session',
        domain: 'www.udemy.com',
        path: '/app',
      });
    });

    it('retries once if cookies remain on first relist, then succeeds if clean', async () => {
      const cookie: Tampermonkey.Cookie = {
        name: 'auth',
        domain: '.udemy.com',
        path: '/',
        hostOnly: false,
        value: 'val',
        httpOnly: true,
        secure: true,
        session: false,
        sameSite: 'None',
      };

      vi.mocked(gmCookie.list)
        .mockResolvedValueOnce([cookie]) // Initial list
        .mockResolvedValueOnce([cookie]) // First relist: still there
        .mockResolvedValueOnce([]); // Second relist: now gone

      vi.mocked(gmCookie.delete).mockResolvedValue();

      await cleanupCookiesForHost('www.udemy.com');

      expect(gmCookie.delete).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
      expect(gmCookie.list).toHaveBeenCalledTimes(3);
    });

    it('fails closed and throws error if cookies still remain after retry', async () => {
      const cookie: Tampermonkey.Cookie = {
        name: 'stubborn_cookie',
        domain: '.udemy.com',
        path: '/',
        hostOnly: false,
        value: 'val',
        httpOnly: true,
        secure: true,
        session: false,
        sameSite: 'None',
      };

      vi.mocked(gmCookie.list)
        .mockResolvedValueOnce([cookie])
        .mockResolvedValueOnce([cookie])
        .mockResolvedValueOnce([cookie]);

      vi.mocked(gmCookie.delete).mockResolvedValue();

      await expect(cleanupCookiesForHost('www.udemy.com')).rejects.toThrow(
        /Failed to clean up 1 cookie\(s\) for www\.udemy\.com: stubborn_cookie/
      );
    });

    it('fails closed if gmCookie.list fails', async () => {
      vi.mocked(gmCookie.list).mockRejectedValue(new Error('GM_cookie.list is not available'));

      await expect(cleanupCookiesForHost('www.udemy.com')).rejects.toThrow(
        'GM_cookie.list is not available'
      );
    });
  });
});
