import { gmXhr, GmHttpError, GmNetworkError } from './gm';
import { Config, Folder, PublicHealthSnapshot } from '../state/types';
import { DesiredCookie } from './cookies';

// Worker base URL
const WORKER_URL = 'https://cf-api-gateway.sitienbmt.workers.dev/udemy/v3';

export type ApiResult<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: string; status?: number };

export interface CookieSourceDomain {
  host: string;
  cookieFileIds: string[];
}

export interface CookieSourcesResponse {
  domains: CookieSourceDomain[];
  fallback?: { cookieFileIds: string[] };
}

export function isTransientStatus(status?: number): boolean {
  if (status === 408 || status === 429) return true;
  if (status !== undefined && status >= 500 && status <= 599) return true;
  return false;
}

const MAX_READ_RETRIES = 2; // initial attempt + 2 retries = 3 attempts total

async function fetchWithTransientRetry<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  let attempts = 0;
  while (true) {
    try {
      const response = await fn();
      if (response && typeof response === 'object' && 'error' in response && (response as any).error) {
        return { ok: false, error: (response as any).error };
      }
      return { ok: true, data: response, status: 200 };
    } catch (error: any) {
      let status: number | undefined;
      let isTransient = false;
      if (error instanceof GmHttpError) {
        status = error.status;
        isTransient = isTransientStatus(status);
      } else if (error instanceof GmNetworkError) {
        isTransient = true;
      }

      if (isTransient && attempts < MAX_READ_RETRIES) {
        attempts++;
        continue;
      }

      return {
        ok: false,
        error: error?.message || String(error),
        status,
      };
    }
  }
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
    return { ok: true, data: response, status: 200 };
  } catch (error: any) {
    const status = error instanceof GmHttpError ? error.status : undefined;
    return { ok: false, error: error?.message || String(error), status };
  }
}

export async function fetchCookieHealth(config: Config): Promise<ApiResult<PublicHealthSnapshot>> {
  try {
    const response = await gmXhr<any>('GET', `${WORKER_URL}/api/cookies/health`, makeHeaders(config));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: response, status: 200 };
  } catch (error: any) {
    const status = error instanceof GmHttpError ? error.status : undefined;
    return { ok: false, error: error?.message || String(error), status };
  }
}

// Cookie sources: GET /api/public/udemy-cookie-sources (no auth)
export async function fetchCookieSources(host: string): Promise<ApiResult<CookieSourcesResponse>> {
  const headers = { 'X-Udemy-Host': host };
  const rawResult = await fetchWithTransientRetry<any>(() =>
    gmXhr<any>('GET', `${WORKER_URL}/api/public/udemy-cookie-sources`, headers)
  );

  if (!rawResult.ok) {
    return rawResult;
  }

  const response = rawResult.data;
  // Map backend response (where domains have cookieCount) to CookieSourcesResponse schema
  const domains: CookieSourceDomain[] = (response.domains || []).map((d: any) => ({
    host: d.host,
    cookieFileIds: d.cookieFileIds || Array.from({ length: d.cookieCount || 0 }, (_, i) => String(i)),
  }));

  const fallback = response.fallback
    ? {
        cookieFileIds:
          response.fallback.cookieFileIds ||
          Array.from({ length: response.fallback.cookieCount || 0 }, (_, i) => String(i)),
      }
    : undefined;

  return { ok: true, data: { domains, fallback }, status: rawResult.status };
}

// Fetch cookies by source: GET /api/public/udemy-cookies?host=...&index=...
export async function fetchCookiesBySource(host: string, fileId: string): Promise<ApiResult<DesiredCookie[]>> {
  const indexVal = /^\d+$/.test(fileId) ? parseInt(fileId, 10) : 0;
  const url = `${WORKER_URL}/api/public/udemy-cookies?host=${encodeURIComponent(host)}&index=${indexVal}`;

  return fetchWithTransientRetry<DesiredCookie[]>(() => gmXhr<DesiredCookie[]>('GET', url));
}

// Init (POST /api/init) — call once on script load when license valid
export async function initSession(config: Config, host: string): Promise<ApiResult<void>> {
  try {
    const response = await gmXhr<any>('POST', `${WORKER_URL}/api/init`, makeHeaders(config, host));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: undefined, status: 200 };
  } catch (error: any) {
    const status = error instanceof GmHttpError ? error.status : undefined;
    return { ok: false, error: error?.message || String(error), status };
  }
}

export interface SyncResponse {
  folders: Folder[];
}

export interface UpdateCourseProgressPayload {
  progress: number;
  is_completed: boolean;
  last_lesson_url: string | null;
}

export interface UpdateCourseProgressResponse {
  course?: Course;
  success?: boolean;
}

// GET /api/sync with makeHeaders(config)
export async function fetchSync(config: Config, host?: string): Promise<ApiResult<SyncResponse>> {
  try {
    const resolvedHost = host ?? (typeof window !== 'undefined' ? window.location.host : undefined);
    const response = await gmXhr<any>('GET', `${WORKER_URL}/api/sync`, makeHeaders(config, resolvedHost));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    if (response && response.folders && Array.isArray(response.folders)) {
      const normalizedFolders: Folder[] = response.folders.map((f: any) => ({
        ...f,
        courses: (f.courses || []).map((c: any) => ({
          ...c,
          id: String(c.course_id ?? c.id),
          udemy_course_id: String(c.udemy_course_id ?? ''),
          is_completed: Boolean(c.is_completed),
          last_lesson_url: c.last_lesson_url ?? null,
          progress: typeof c.progress === 'number' ? c.progress : 0,
        })),
      }));
      return { ok: true, data: { folders: normalizedFolders }, status: 200 };
    }
    return { ok: true, data: response, status: 200 };
  } catch (error: any) {
    const status = error instanceof GmHttpError ? error.status : undefined;
    return { ok: false, error: error?.message || String(error), status };
  }
}

// PUT /api/folders/{folderId}/courses/{courseId}
export async function updateCourseProgress(
  config: Config,
  folderId: string,
  courseId: string,
  payload: UpdateCourseProgressPayload,
  host?: string
): Promise<ApiResult<UpdateCourseProgressResponse>> {
  try {
    const resolvedHost = host ?? (typeof window !== 'undefined' ? window.location.host : undefined);
    const body = {
      progress: payload.progress,
      is_completed: payload.is_completed,
      last_lesson_url: payload.last_lesson_url,
    };
    const response = await gmXhr<any>(
      'PUT',
      `${WORKER_URL}/api/folders/${folderId}/courses/${courseId}`,
      makeHeaders(config, resolvedHost),
      JSON.stringify(body)
    );
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: response, status: 200 };
  } catch (error: any) {
    const status = error instanceof GmHttpError ? error.status : undefined;
    return { ok: false, error: error?.message || String(error), status };
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
    return { ok: true, data: response, status: 200 };
  } catch (error: any) {
    const status = error instanceof GmHttpError ? error.status : undefined;
    return { ok: false, error: error?.message || String(error), status };
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
    return { ok: true, data: response, status: 200 };
  } catch (error: any) {
    const status = error instanceof GmHttpError ? error.status : undefined;
    return { ok: false, error: error?.message || String(error), status };
  }
}

// DELETE /api/folders/{folderId}
export async function deleteFolder(config: Config, folderId: string): Promise<ApiResult<void>> {
  try {
    const response = await gmXhr<any>('DELETE', `${WORKER_URL}/api/folders/${folderId}`, makeHeaders(config));
    if (response && response.error) {
      return { ok: false, error: response.error };
    }
    return { ok: true, data: undefined, status: 200 };
  } catch (error: any) {
    const status = error instanceof GmHttpError ? error.status : undefined;
    return { ok: false, error: error?.message || String(error), status };
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
    return { ok: true, data: response, status: 200 };
  } catch (error: any) {
    const status = error instanceof GmHttpError ? error.status : undefined;
    return { ok: false, error: error?.message || String(error), status };
  }
}
