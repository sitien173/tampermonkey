/**
 * Typed wrappers for Greasemonkey/Tampermonkey GM_* APIs.
 */

export interface GMXhrResponse {
  responseText: string;
  status: number;
  statusText: string;
  responseHeaders: string;
}

export interface GMXhrDetails {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  onload?: (response: GMXhrResponse) => void;
  onerror?: (error: unknown) => void;
  ontimeout?: () => void;
}

export class GmHttpError extends Error {
  status: number;
  statusText: string;
  responseHeaders?: string;
  responseText?: string;

  constructor(status: number, statusText: string, responseHeaders?: string, responseText?: string) {
    super(`HTTP Error ${status}: ${statusText}`);
    this.name = 'GmHttpError';
    this.status = status;
    this.statusText = statusText;
    this.responseHeaders = responseHeaders;
    this.responseText = responseText;
  }
}

/**
 * A network-level or timeout failure with no HTTP response. Retryable.
 */
export class GmNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmNetworkError';
  }
}

declare const GM_getValue: <T>(key: string, defaultValue?: T) => T;
declare const GM_setValue: <T>(key: string, value: T) => void;
declare const GM_deleteValue: (key: string) => void;
declare const GM_registerMenuCommand: (caption: string, fn: () => void) => void;
declare const GM_xmlhttpRequest: (details: GMXhrDetails) => void;

// GM_cookie is provided by @types/tampermonkey

export type DeleteCookieDetails = {
  url?: string;
  name?: string;
  domain?: string;
  firstPartyDomain?: string;
  path?: string;
};

/**
 * Get a value from persistent storage.
 */
export async function gmGet<T>(key: string, defaultValue: T): Promise<T> {
  if (typeof GM_getValue === 'undefined') {
    throw new Error('GM_getValue is not available');
  }
  return GM_getValue(key, defaultValue);
}

/**
 * Set a value in persistent storage.
 */
export async function gmSet<T>(key: string, value: T): Promise<void> {
  if (typeof GM_setValue === 'undefined') {
    throw new Error('GM_setValue is not available');
  }
  GM_setValue(key, value);
}

/**
 * Delete a value from persistent storage.
 */
export async function gmDelete(key: string): Promise<void> {
  if (typeof GM_deleteValue === 'undefined') {
    throw new Error('GM_deleteValue is not available');
  }
  GM_deleteValue(key);
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
        return reject(new Error('GM_cookie.list is not available'));
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
        return reject(new Error('GM_cookie.set is not available'));
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
        return reject(new Error('GM_cookie.delete is not available'));
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
export function gmXhr<T>(
  method: string,
  url: string,
  headers?: Record<string, string>,
  body?: string,
  timeout?: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest === 'undefined') {
      return reject(new GmNetworkError('GM_xmlhttpRequest is not available'));
    }
    GM_xmlhttpRequest({
      method,
      url,
      headers,
      data: body,
      timeout,
      onload: (response: GMXhrResponse) => {
        if (response.status < 200 || response.status >= 300) {
          reject(
            new GmHttpError(
              response.status,
              response.statusText,
              response.responseHeaders,
              response.responseText
            )
          );
          return;
        }
        try {
          const data = JSON.parse(response.responseText);
          resolve(data as T);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${response.responseText}`));
        }
      },
      onerror: (error: unknown) =>
        reject(
          error instanceof GmNetworkError
            ? error
            : new GmNetworkError(error instanceof Error ? error.message : String(error))
        ),
      ontimeout: () => reject(new GmNetworkError('Request timed out')),
    });
  });
}
