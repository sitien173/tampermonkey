/**
 * Resolves course URLs safely for organizer links.
 * Accepts HTTP, HTTPS, and root-relative course paths.
 * Resolves root-relative paths against window.location.origin (or supplied baseOrigin).
 * Rejects unsafe schemes (javascript:, file:, data:, etc.), scheme-relative URLs, and invalid values.
 */
export function resolveCourseUrl(
  rawUrl: string | null | undefined,
  baseOrigin?: string
): string | null {
  if (typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  // Reject embedded control whitespace that URL parsing would strip or
  // reinterpret (e.g. "/\t/evil.com" resolving to an external host).
  if (/[\t\n\r]/.test(trimmed)) {
    return null;
  }

  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('\\')
  ) {
    return null;
  }

  if (trimmed.startsWith('/')) {
    const origin = (
      baseOrigin ??
      (typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : '')
    ).trim();

    if (!origin) {
      return null;
    }

    try {
      const base = new URL(origin);
      const resolved = new URL(trimmed, base);
      if (
        (resolved.protocol === 'http:' || resolved.protocol === 'https:') &&
        resolved.hostname &&
        resolved.hostname.length > 0 &&
        resolved.origin === base.origin
      ) {
        return resolved.href;
      }
      return null;
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname &&
      parsed.hostname.length > 0
    ) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}
