export function isPlausibleAccessToken(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const token = value.trim();
  if (!token) return false;
  if (token.length < 20 || token.length > 4096) return false;
  if (token.startsWith('{') || token.startsWith('[')) return false;
  return true;
}

export function findAccessTokenInValue(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    if (isPlausibleAccessToken(text)) return text;

    const looksLikeJson =
      (text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'));
    if (!looksLikeJson) return null;

    try {
      return findAccessTokenInValue(JSON.parse(text), depth + 1);
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const token = findAccessTokenInValue(item, depth + 1);
      if (token) return token;
    }
    return null;
  }

  if (typeof value === 'object') {
    const directToken = (value as any).access_token;
    if (isPlausibleAccessToken(directToken)) {
      return directToken.trim();
    }

    for (const nestedValue of Object.values(value)) {
      const token = findAccessTokenInValue(nestedValue, depth + 1);
      if (token) return token;
    }
  }

  return null;
}

export function getAccessTokenFromStorage(storage: Storage | null): string | null {
  if (!storage) return null;

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;

    let rawValue;
    try {
      rawValue = storage.getItem(key);
    } catch {
      continue;
    }

    const token = findAccessTokenInValue(rawValue);
    if (token) return token;
  }

  return null;
}

export function getUdemyAccessToken(): string | null {
  try {
    const localToken = getAccessTokenFromStorage(window.localStorage);
    if (localToken) return localToken;
  } catch {
    // Storage access can throw in restricted browser contexts.
  }

  try {
    const sessionToken = getAccessTokenFromStorage(window.sessionStorage);
    if (sessionToken) return sessionToken;
  } catch {
    // Storage access can throw in restricted browser contexts.
  }

  return null;
}
