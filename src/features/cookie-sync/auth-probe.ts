export type AuthProbeResult =
  | { kind: 'authenticated'; status: number }
  | { kind: 'expired'; status?: number }
  | { kind: 'network_error'; error: string };

const MAX_PROBE_RETRIES = 2; // initial + 2 retries = 3 attempts total

export async function probeAuth(
  host: string,
  fetchFn: typeof fetch = typeof fetch !== 'undefined' ? fetch.bind(window) : fetch
): Promise<AuthProbeResult> {
  const url = `https://${host}/api-2.0/users/me/`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_PROBE_RETRIES; attempt++) {
    try {
      const response = await fetchFn(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'manual',
      });

      // Browser manual redirect responses can have type 'opaqueredirect' or status 0 / 3xx
      if (
        response.type === 'opaqueredirect' ||
        (response.status >= 300 && response.status < 400)
      ) {
        return { kind: 'expired', status: response.status || 302 };
      }

      if (response.status >= 200 && response.status < 300) {
        return { kind: 'authenticated', status: response.status };
      }

      // Any other HTTP response (e.g. 401, 403, 404, 500) indicates expired/invalid session
      return { kind: 'expired', status: response.status };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  return {
    kind: 'network_error',
    error: lastError?.message || 'Network error during authentication probe',
  };
}
