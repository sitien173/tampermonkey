import { gmCookie, DeleteCookieDetails } from '../../lib/gm';
import { ExistingCookie, normalizeCookieDomain } from '../../lib/cookies';

/**
 * Determines whether a cookie applies to currentHost according to browser domain-matching rules.
 * - Host-only cookies match if and only if cookie domain equals currentHost.
 * - Domain cookies match if currentHost equals cookie domain or is a subdomain of cookie domain.
 */
export function isCookieApplicable(
  cookie: { domain: string; hostOnly?: boolean },
  currentHost: string
): boolean {
  const normalizedHost = normalizeCookieDomain(currentHost);
  const normalizedDomain = normalizeCookieDomain(cookie.domain || '');

  if (!normalizedHost || !normalizedDomain) {
    return false;
  }

  if (cookie.hostOnly === true) {
    return normalizedHost === normalizedDomain;
  }

  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith(`.${normalizedDomain}`)
  );
}

/**
 * Builds standard DeleteCookieDetails for GM_cookie.delete preserving name, domain, and path.
 */
export function buildDeleteCookieDetails(
  cookie: Tampermonkey.Cookie | ExistingCookie
): DeleteCookieDetails {
  const domainWithoutDot = normalizeCookieDomain(cookie.domain);
  const rawPath = cookie.path || '/';
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const url = `https://${domainWithoutDot}${path}`;

  return {
    url,
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
  };
}

/**
 * Deletes all cookies applicable to the given host (both host-only and parent domain cookies like .udemy.com).
 * Retries remaining cookies once if initial deletion leaves any behind.
 * Fails closed (throws) if any applicable cookie remains after retry or if listing fails.
 */
export async function cleanupCookiesForHost(currentHost: string): Promise<void> {
  const initialCookies = await gmCookie.list({});
  const applicable = initialCookies.filter((c) => isCookieApplicable(c, currentHost));

  if (applicable.length === 0) {
    return;
  }

  // Initial deletion pass
  await Promise.allSettled(applicable.map((c) => gmCookie.delete(buildDeleteCookieDetails(c))));

  // Relist pass 1
  const relisted1 = await gmCookie.list({});
  const remaining1 = relisted1.filter((c) => isCookieApplicable(c, currentHost));

  if (remaining1.length > 0) {
    // Retry deletion pass once for remaining cookies
    await Promise.allSettled(remaining1.map((c) => gmCookie.delete(buildDeleteCookieDetails(c))));

    // Relist pass 2
    const relisted2 = await gmCookie.list({});
    const remaining2 = relisted2.filter((c) => isCookieApplicable(c, currentHost));

    if (remaining2.length > 0) {
      const names = remaining2.map((c) => c.name).join(', ');
      throw new Error(
        `Failed to clean up ${remaining2.length} cookie(s) for ${currentHost}: ${names}`
      );
    }
  }
}
