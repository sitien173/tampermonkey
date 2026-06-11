import { PublicHealthSnapshot } from '../../state/types';

const STORAGE_KEY = 'udemyHealthyDomainSwitch';
const HOST_COOLDOWN_MS = 60_000;
const MAX_AUTO_ATTEMPTS = 2;

type AttemptRecord = {
  host: string;
  ts: number;
  attempts: number;
};

function readAttemptRecord(): AttemptRecord | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<AttemptRecord>;
    if (
      typeof parsed.host !== 'string' ||
      typeof parsed.ts !== 'number' ||
      typeof parsed.attempts !== 'number'
    ) {
      return null;
    }

    return {
      host: parsed.host,
      ts: parsed.ts,
      attempts: parsed.attempts,
    };
  } catch {
    return null;
  }
}

export function pickHealthyHost(snapshot: PublicHealthSnapshot | null, currentHost: string): string | null {
  if (!snapshot) {
    return null;
  }

  const currentHostLower = currentHost.toLowerCase();
  const target = snapshot.domains.find(
    (domain) => domain.status === 'healthy' && domain.host.toLowerCase() !== currentHostLower
  );

  return target?.host ?? null;
}

export function buildRedirectUrl(targetHost: string, currentUrl: string): string | null {
  if (!targetHost) {
    return null;
  }

  try {
    const url = new URL(currentUrl);
    url.host = targetHost;
    return url.toString();
  } catch {
    return null;
  }
}

export function canAttempt(target: string, opts?: { manual?: boolean }): boolean {
  if (opts?.manual) {
    return true;
  }

  const attemptRecord = readAttemptRecord();
  if (!attemptRecord) {
    return true;
  }

  if (
    attemptRecord.host.toLowerCase() === target.toLowerCase() &&
    Date.now() - attemptRecord.ts < HOST_COOLDOWN_MS
  ) {
    return false;
  }

  return attemptRecord.attempts < MAX_AUTO_ATTEMPTS;
}

export function recordAttempt(target: string): void {
  try {
    const attemptRecord = readAttemptRecord();
    const nextRecord: AttemptRecord = {
      host: target,
      ts: Date.now(),
      attempts: (attemptRecord?.attempts ?? 0) + 1,
    };

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecord));
  } catch {
    // Ignore storage failures so redirect logic still functions in restricted environments.
  }
}
