import { PublicHealthSnapshot } from '../../state/types';
import { gmGet, gmSet, gmDelete } from '../../lib/gm';
import { normalizeCookieDomain } from '../../lib/cookies';
import { getCurrentUdemyHost } from '../../lib/host';

export const DOMAIN_SWITCH_STORAGE_KEY = 'udemyHealthyDomainSwitch';
export const DOMAIN_SWITCH_TTL_MS = 2 * 60 * 1000; // 2 minutes (120_000 ms)
export const MAX_DOMAIN_HOPS = 2;

export interface DomainSwitchState {
  version: 1;
  expiresAt: number;
  visitedHosts: string[];
}

export async function readDomainSwitchState(): Promise<DomainSwitchState | null> {
  const raw = await gmGet<DomainSwitchState | null>(DOMAIN_SWITCH_STORAGE_KEY, null);
  if (!raw) {
    return null;
  }

  if (
    typeof raw !== 'object' ||
    raw.version !== 1 ||
    typeof raw.expiresAt !== 'number' ||
    !Array.isArray(raw.visitedHosts)
  ) {
    await clearDomainSwitchState();
    return null;
  }

  if (Date.now() >= raw.expiresAt) {
    await clearDomainSwitchState();
    return null;
  }

  return {
    version: 1,
    expiresAt: raw.expiresAt,
    visitedHosts: raw.visitedHosts.map(normalizeCookieDomain),
  };
}

export async function clearDomainSwitchState(): Promise<void> {
  await gmDelete(DOMAIN_SWITCH_STORAGE_KEY);
}

/**
 * Accept only canonical Udemy hostnames: `udemy.com` or a `*.udemy.com` subdomain.
 */
export function isValidUdemyHost(host: string): boolean {
  const normalized = normalizeCookieDomain(host);
  if (!normalized) {
    return false;
  }
  return normalized === 'udemy.com' || normalized.endsWith('.udemy.com');
}

export function pickHealthyHost(
  snapshot: PublicHealthSnapshot | null,
  currentHost: string,
  visitedHosts: string[] = []
): string | null {
  if (!snapshot) {
    return null;
  }

  const normalizedCurrent = normalizeCookieDomain(currentHost);
  const normalizedVisited = new Set(visitedHosts.map(normalizeCookieDomain));
  normalizedVisited.add(normalizedCurrent);

  const target = snapshot.domains.find(
    (domain) =>
      domain.status === 'healthy' &&
      isValidUdemyHost(domain.host) &&
      !normalizedVisited.has(normalizeCookieDomain(domain.host))
  );

  return target?.host ?? null;
}

export function buildRedirectUrl(targetHost: string, currentUrl: string): string | null {
  if (!targetHost || !isValidUdemyHost(targetHost)) {
    return null;
  }

  try {
    const url = new URL(currentUrl);
    url.host = targetHost;
    if (normalizeCookieDomain(url.hostname) !== normalizeCookieDomain(targetHost)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export interface CanAttemptOptions {
  manual?: boolean;
  currentHost?: string;
}

export async function canAttempt(
  target: string,
  opts?: CanAttemptOptions
): Promise<boolean> {
  if (opts?.manual) {
    return true;
  }

  const targetNorm = normalizeCookieDomain(target);
  let currentNorm = '';
  try {
    currentNorm = normalizeCookieDomain(opts?.currentHost ?? getCurrentUdemyHost());
  } catch {
    currentNorm = '';
  }

  const state = await readDomainSwitchState();

  if (!state) {
    return true;
  }

  // Reject previously visited targets to prevent redirect loops
  if (state.visitedHosts.includes(targetNorm)) {
    return false;
  }

  // Automatic switching may only continue the active flow from its endpoint.
  const endpoint = state.visitedHosts[state.visitedHosts.length - 1];
  if (!currentNorm || currentNorm !== endpoint) {
    return false;
  }

  // Hops executed so far in the active flow: visitedHosts [A, B] means one hop.
  // A flow permits at most MAX_DOMAIN_HOPS hops.
  const hopsDone = state.visitedHosts.length - 1;
  if (hopsDone >= MAX_DOMAIN_HOPS) {
    return false;
  }

  return true;
}

export async function recordAttempt(
  target: string,
  currentHostOrOpts?: string | CanAttemptOptions,
  maybeOpts?: CanAttemptOptions
): Promise<void> {
  let currentHost: string | undefined;
  let isManual = false;

  if (typeof currentHostOrOpts === 'string') {
    currentHost = currentHostOrOpts;
    if (maybeOpts?.manual) {
      isManual = true;
    }
  } else if (currentHostOrOpts && typeof currentHostOrOpts === 'object') {
    currentHost = currentHostOrOpts.currentHost;
    isManual = !!currentHostOrOpts.manual;
  }

  if (!currentHost) {
    try {
      currentHost = getCurrentUdemyHost();
    } catch {
      currentHost = '';
    }
  }

  const currentNorm = normalizeCookieDomain(currentHost);
  const targetNorm = normalizeCookieDomain(target);
  const now = Date.now();

  if (isManual) {
    const visitedHosts =
      currentNorm && currentNorm !== targetNorm
        ? [currentNorm, targetNorm]
        : [targetNorm];

    const nextState: DomainSwitchState = {
      version: 1,
      expiresAt: now + DOMAIN_SWITCH_TTL_MS,
      visitedHosts,
    };

    await gmSet(DOMAIN_SWITCH_STORAGE_KEY, nextState);
    return;
  }

  const activeState = await readDomainSwitchState();
  if (activeState) {
    // The automatic flow continues from its endpoint, which is currentNorm.
    const visited = [...activeState.visitedHosts];
    if (!visited.includes(targetNorm)) {
      visited.push(targetNorm);
    }

    const nextState: DomainSwitchState = {
      version: 1,
      expiresAt: activeState.expiresAt,
      visitedHosts: visited,
    };

    await gmSet(DOMAIN_SWITCH_STORAGE_KEY, nextState);
  } else {
    const visitedHosts =
      currentNorm && currentNorm !== targetNorm
        ? [currentNorm, targetNorm]
        : [targetNorm];

    const nextState: DomainSwitchState = {
      version: 1,
      expiresAt: now + DOMAIN_SWITCH_TTL_MS,
      visitedHosts,
    };

    await gmSet(DOMAIN_SWITCH_STORAGE_KEY, nextState);
  }
}
