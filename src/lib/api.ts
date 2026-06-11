import { gmXhr } from './gm';
import { Config, Folder, PublicHealthSnapshot } from '../state/types';
import { DesiredCookie } from './cookies';

// Worker base URL
const WORKER_URL = 'https://cf-api-gateway.sitienbmt.workers.dev/udemy/v3';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface CookieSourceDomain {
  host: string;
  cookieFileIds: string[];
}

export interface CookieSourcesResponse {
  domains: CookieSourceDomain[];
  fallback?: { cookieFileIds: string[] };
}


// Internal helper: builds headers from current config
function makeHeaders(config: Config, host?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-License-Key': config.licenseKey,
    'X-API-Key': config.apiKey,
    'Content-Type': 'application/json',
  };
  if (host) {
    headers['X-Udemy-Host'] = host;
  }
  return headers;
}

// License validate: GET /api/license/validate (with X-License-Key header)
// Returns { valid: boolean, expiresAt?: number, message?: string }
export async function validateLicense(config: Config): Promise<ApiResult<{ valid: boolean; expiresAt?: number; message?: string }>> {
  try {
    const response = await gmXhr<any>('GET', `${WORKER_URL}/api/license/validate`, makeHeaders(config));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: response };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function fetchCookieHealth(config: Config): Promise<ApiResult<PublicHealthSnapshot>> {
  try {
    const response = await gmXhr<any>('GET', `${WORKER_URL}/api/cookies/health`, makeHeaders(config));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: response };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

// Cookie sources: GET /api/public/udemy-cookie-sources (no auth)
export async function fetchCookieSources(host: string): Promise<ApiResult<CookieSourcesResponse>> {
  try {
    const headers = { 'X-Udemy-Host': host };
    const response = await gmXhr<any>('GET', `${WORKER_URL}/api/public/udemy-cookie-sources`, headers);
    if (response && response.error) {
      return { ok: false, error: response.error };
    }

    // Map backend response (where domains have cookieCount) to CookieSourcesResponse schema
    const domains: CookieSourceDomain[] = (response.domains || []).map((d: any) => ({
      host: d.host,
      cookieFileIds: d.cookieFileIds || Array.from({ length: d.cookieCount || 0 }, (_, i) => String(i))
    }));

    const fallback = response.fallback ? {
      cookieFileIds: response.fallback.cookieFileIds || Array.from({ length: response.fallback.cookieCount || 0 }, (_, i) => String(i))
    } : undefined;

    return { ok: true, data: { domains, fallback } };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

// Fetch cookies by source: GET /api/public/udemy-cookies?host=...&index=...
export async function fetchCookiesBySource(host: string, fileId: string): Promise<ApiResult<DesiredCookie[]>> {
  try {
    // If the actual endpoint still uses index, parse fileId as integer if numeric, else 0
    const indexVal = /^\d+$/.test(fileId) ? parseInt(fileId, 10) : 0;
    const url = `${WORKER_URL}/api/public/udemy-cookies?host=${encodeURIComponent(host)}&index=${indexVal}`;
    const response = await gmXhr<any>('GET', url);
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: response };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}


// Init (POST /api/init) — call once on script load when license valid
export async function initSession(config: Config, host: string): Promise<ApiResult<void>> {
  try {
    const response = await gmXhr<any>('POST', `${WORKER_URL}/api/init`, makeHeaders(config, host));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: undefined };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export interface SyncResponse {
  folders: Folder[];
}

// GET /api/sync with makeHeaders(config)
export async function fetchSync(config: Config): Promise<ApiResult<SyncResponse>> {
  try {
    const response = await gmXhr<any>('GET', `${WORKER_URL}/api/sync`, makeHeaders(config));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: response };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

// POST /api/folders
export async function createFolder(
  config: Config,
  data: { name: string; color: string; icon?: string }
): Promise<ApiResult<{ folder: Folder }>> {
  try {
    const response = await gmXhr<any>('POST', `${WORKER_URL}/api/folders`, makeHeaders(config), JSON.stringify(data));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: response };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

// PUT /api/folders/{folderId}
export async function updateFolder(
  config: Config,
  folderId: string,
  data: Partial<Folder>
): Promise<ApiResult<{ folder: Folder }>> {
  try {
    const response = await gmXhr<any>('PUT', `${WORKER_URL}/api/folders/${folderId}`, makeHeaders(config), JSON.stringify(data));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: response };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

// DELETE /api/folders/{folderId}
export async function deleteFolder(config: Config, folderId: string): Promise<ApiResult<void>> {
  try {
    const response = await gmXhr<any>('DELETE', `${WORKER_URL}/api/folders/${folderId}`, makeHeaders(config));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: undefined };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function addCourseToFolders(
  config: Config,
  body: { course_id: string | number; folder_ids: string[] },
  accessToken: string
): Promise<ApiResult<{ added: number }>> {
  try {
    const headers = {
      ...makeHeaders(config),
      Authorization: `Bearer ${accessToken}`,
    };
    const response = await gmXhr<any>(
      'POST',
      `${WORKER_URL}/api/courses/multi-folder`,
      headers,
      JSON.stringify(body)
    );
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: response };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
}


