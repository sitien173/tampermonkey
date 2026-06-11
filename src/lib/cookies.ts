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
}

export type CookieOp =
  | { type: 'set'; cookie: DesiredCookie }
  | { type: 'delete'; name: string; domain: string };

export function diffCookies(
  existing: ExistingCookie[],
  desired: DesiredCookie[],
  nowSeconds = Date.now() / 1000
): CookieOp[] {
  const ops: CookieOp[] = [];
  const activeDesired = desired.filter(
    (cookie) => cookie.expirationDate === undefined || cookie.expirationDate > nowSeconds
  );

  // Index existing cookies by (name, domain) tuple using a null character separator
  const existingMap = new Map<string, ExistingCookie>();
  for (const cookie of existing) {
    const key = `${cookie.name}\0${cookie.domain}`;
    existingMap.set(key, cookie);
  }

  // Index desired cookies by (name, domain) tuple
  const desiredMap = new Map<string, DesiredCookie>();
  for (const cookie of activeDesired) {
    const key = `${cookie.name}\0${cookie.domain}`;
    desiredMap.set(key, cookie);
  }

  // Check which desired cookies need to be set
  for (const dCookie of activeDesired) {
    const key = `${dCookie.name}\0${dCookie.domain}`;
    const eCookie = existingMap.get(key);

    if (!eCookie || eCookie.value !== dCookie.value) {
      ops.push({ type: 'set', cookie: dCookie });
    }
  }

  // Check which existing cookies need to be deleted
  for (const eCookie of existing) {
    const key = `${eCookie.name}\0${eCookie.domain}`;
    if (!desiredMap.has(key)) {
      ops.push({ type: 'delete', name: eCookie.name, domain: eCookie.domain });
    }
  }

  return ops;
}
