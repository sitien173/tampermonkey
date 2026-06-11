/**
 * Typed wrappers for Greasemonkey/Tampermonkey GM_* APIs.
 */

interface GMXhrResponse {
  responseText: string;
  status: number;
  statusText: string;
  responseHeaders: string;
}

interface GMXhrDetails {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  onload?: (response: GMXhrResponse) => void;
  onerror?: (error: unknown) => void;
}

declare const GM_getValue: <T>(key: string, defaultValue?: T) => T;
declare const GM_setValue: <T>(key: string, value: T) => void;
declare const GM_registerMenuCommand: (caption: string, fn: () => void) => void;
declare const GM_xmlhttpRequest: (details: GMXhrDetails) => void;

// GM_cookie is provided by @types/tampermonkey

type DeleteCookieDetails = {
  url?: string;
  name?: string;
  domain?: string;
  firstPartyDomain?: string;
};

/**
 * Get a value from persistent storage.
 */
export async function gmGet<T>(key: string, defaultValue: T): Promise<T> {
  if (typeof GM_getValue === 'undefined') {
    console.error('GM_getValue is not available');
    return defaultValue;
  }
  return GM_getValue(key, defaultValue);
}

/**
 * Set a value in persistent storage.
 */
export async function gmSet<T>(key: string, value: T): Promise<void> {
  if (typeof GM_setValue === 'undefined') {
    console.error('GM_setValue is not available');
    return;
  }
  GM_setValue(key, value);
}

/**
 * Register a menu command.
 */
export function gmMenu(caption: string, fn: () => void): void {
  if (typeof GM_registerMenuCommand === 'undefined') {
    console.error('GM_registerMenuCommand is not available');
    return;
  }
  GM_registerMenuCommand(caption, fn);
}

/**
 * Cookie management wrappers.
 */
export const gmCookie = {
  list(details: Tampermonkey.ListCookiesDetails = {}): Promise<Tampermonkey.Cookie[]> {
    return new Promise((resolve, reject) => {
      if (typeof GM_cookie === 'undefined' || !GM_cookie.list) {
        console.error('GM_cookie.list is not available');
        return resolve([]);
      }
      GM_cookie.list(details, (cookies, error) => {
        if (error) reject(error);
        else resolve(cookies);
      });
    });
  },
  set(details: Tampermonkey.SetCookiesDetails): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof GM_cookie === 'undefined' || !GM_cookie.set) {
        console.error('GM_cookie.set is not available');
        return resolve();
      }
      GM_cookie.set(details, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  },
  delete(details: DeleteCookieDetails): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof GM_cookie === 'undefined' || !GM_cookie.delete) {
        console.error('GM_cookie.delete is not available');
        return resolve();
      }
      GM_cookie.delete(details as any, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
};

/**
 * Perform a cross-origin XMLHTTPRequest.
 */
export function gmXhr<T>(method: string, url: string, headers?: Record<string, string>, body?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest === 'undefined') {
      console.error('GM_xmlhttpRequest is not available');
      return reject(new Error('GM_xmlhttpRequest is not available'));
    }
    GM_xmlhttpRequest({
      method,
      url,
      headers,
      data: body,
      onload: (response: GMXhrResponse) => {
        if (response.status < 200 || response.status >= 300) {
          reject(new Error(`HTTP Error ${response.status}: ${response.statusText}`));
          return;
        }
        try {
          const data = JSON.parse(response.responseText);
          resolve(data as T);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${response.responseText}`));
        }
      },
      onerror: (error: unknown) => reject(error)
    });
  });
}
