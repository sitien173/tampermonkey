export interface DesiredCookie {
  name: string;
  value: string;
  domain: string;
  hostOnly?: boolean;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
}

export interface ExistingCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  hostOnly?: boolean;
}

export type CookieOp =
  | { type: 'set'; cookie: DesiredCookie }
  | {
      type: 'delete';
      name: string;
      domain: string;
      path?: string;
      hostOnly?: boolean;
    };

export function normalizeCookieDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\./, '');
}

export function cookieIdentityKey(name: string, domain: string, path = '/'): string {
  const normDomain = normalizeCookieDomain(domain);
  const normPath = path.startsWith('/') ? path : `/${path}`;
  return `${name}\0${normDomain}\0${normPath}`;
}

export function diffCookies(
  existing: ExistingCookie[],
  desired: DesiredCookie[],
  nowSeconds = Date.now() / 1000
): CookieOp[] {
  const ops: CookieOp[] = [];
  const activeDesired = desired.filter(
    (cookie) => cookie.expirationDate === undefined || cookie.expirationDate > nowSeconds
  );

  // Index existing cookies by (name, normalized domain, path) tuple using a null character separator
  const existingMap = new Map<string, ExistingCookie>();
  for (const cookie of existing) {
    const key = cookieIdentityKey(cookie.name, cookie.domain, cookie.path);
    existingMap.set(key, cookie);
  }

  // Index desired cookies by (name, normalized domain, path) tuple
  const desiredMap = new Map<string, DesiredCookie>();
  for (const cookie of activeDesired) {
    const key = cookieIdentityKey(cookie.name, cookie.domain, cookie.path);
    desiredMap.set(key, cookie);
  }

  // Check which desired cookies need to be set
  for (const dCookie of activeDesired) {
    const key = cookieIdentityKey(dCookie.name, dCookie.domain, dCookie.path);
    const eCookie = existingMap.get(key);

    if (!eCookie || eCookie.value !== dCookie.value) {
      ops.push({ type: 'set', cookie: dCookie });
    }
  }

  // Check which existing cookies need to be deleted
  for (const eCookie of existing) {
    const key = cookieIdentityKey(eCookie.name, eCookie.domain, eCookie.path);
    if (!desiredMap.has(key)) {
      ops.push({
        type: 'delete',
        name: eCookie.name,
        domain: eCookie.domain,
        ...(eCookie.path !== undefined ? { path: eCookie.path } : {}),
        ...(eCookie.hostOnly !== undefined ? { hostOnly: eCookie.hostOnly } : {}),
      });
    }
  }

  return ops;
}
