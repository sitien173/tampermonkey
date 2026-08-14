import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRedirectUrl,
  canAttempt,
  clearDomainSwitchState,
  isValidUdemyHost,
  pickHealthyHost,
  readDomainSwitchState,
  recordAttempt,
  DOMAIN_SWITCH_TTL_MS,
} from '../switch';
import { PublicHealthSnapshot } from '../../../state/types';

describe('healthy-domain switch helpers', () => {
  let gmStorage: Record<string, any> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T00:00:00Z'));
    gmStorage = {};

    vi.stubGlobal('GM_getValue', vi.fn((key: string, defaultVal: any) => {
      return gmStorage[key] !== undefined ? gmStorage[key] : defaultVal;
    }));

    vi.stubGlobal('GM_setValue', vi.fn((key: string, val: any) => {
      gmStorage[key] = val;
    }));

    vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => {
      delete gmStorage[key];
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns null when snapshot is null', () => {
    expect(pickHealthyHost(null, 'www.udemy.com')).toBeNull();
  });

  it('returns null when no healthy non-current host exists', () => {
    const snapshot: PublicHealthSnapshot = {
      runAt: '2026-06-11T00:00:00Z',
      domains: [
        { host: 'www.udemy.com', status: 'healthy', lastChecked: null },
        { host: 'business.udemy.com', status: 'down', lastChecked: null },
      ],
    };

    expect(pickHealthyHost(snapshot, 'www.udemy.com')).toBeNull();
  });

  it('returns the first healthy host that is not the current host', () => {
    const snapshot: PublicHealthSnapshot = {
      runAt: '2026-06-11T00:00:00Z',
      domains: [
        { host: 'www.udemy.com', status: 'down', lastChecked: null },
        { host: 'business.udemy.com', status: 'healthy', lastChecked: null },
        { host: 'team.udemy.com', status: 'healthy', lastChecked: null },
      ],
    };

    expect(pickHealthyHost(snapshot, 'www.udemy.com')).toBe('business.udemy.com');
  });

  it('ignores previously visited hosts when picking healthy host', () => {
    const snapshot: PublicHealthSnapshot = {
      runAt: '2026-06-11T00:00:00Z',
      domains: [
        { host: 'www.udemy.com', status: 'healthy', lastChecked: null },
        { host: 'business.udemy.com', status: 'healthy', lastChecked: null },
        { host: 'team.udemy.com', status: 'healthy', lastChecked: null },
      ],
    };

    // Current host is business.udemy.com, and www.udemy.com was already visited
    expect(
      pickHealthyHost(snapshot, 'business.udemy.com', ['www.udemy.com', 'business.udemy.com'])
    ).toBe('team.udemy.com');
  });

  it('returns null for malformed redirect URLs or empty target host', () => {
    expect(buildRedirectUrl('', 'https://www.udemy.com/course/test/')).toBeNull();
    expect(buildRedirectUrl('business.udemy.com', 'not-a-url')).toBeNull();
  });

  it('builds a redirect URL by replacing only the host', () => {
    expect(
      buildRedirectUrl('business.udemy.com', 'https://www.udemy.com/course/test/?x=1#lesson')
    ).toBe('https://business.udemy.com/course/test/?x=1#lesson');
  });

  it('records domain switch state in GM storage with version, expiry and visited hosts', async () => {
    await recordAttempt('business.udemy.com', 'www.udemy.com');

    const state = await readDomainSwitchState();
    expect(state).toEqual({
      version: 1,
      expiresAt: Date.now() + DOMAIN_SWITCH_TTL_MS,
      visitedHosts: ['www.udemy.com', 'business.udemy.com'],
    });
  });

  it('always allows manual attempts and resets state into a fresh flow', async () => {
    await recordAttempt('business.udemy.com', 'www.udemy.com');
    await recordAttempt('team.udemy.com', 'business.udemy.com');

    // Hop limit reached for auto
    expect(await canAttempt('campus.udemy.com', { currentHost: 'team.udemy.com' })).toBe(false);

    // Manual is always allowed
    expect(await canAttempt('campus.udemy.com', { manual: true, currentHost: 'team.udemy.com' })).toBe(true);

    // Recording manual switch resets history
    await recordAttempt('campus.udemy.com', 'team.udemy.com', { manual: true });

    const state = await readDomainSwitchState();
    expect(state?.visitedHosts).toEqual(['team.udemy.com', 'campus.udemy.com']);
  });

  it('blocks repeat auto attempts to previously visited target', async () => {
    await recordAttempt('business.udemy.com', 'www.udemy.com');

    // Trying to loop back to www.udemy.com is blocked
    expect(await canAttempt('www.udemy.com', { currentHost: 'business.udemy.com' })).toBe(false);
    // Trying to redirect to same target is blocked
    expect(await canAttempt('business.udemy.com', { currentHost: 'business.udemy.com' })).toBe(false);
  });

  it('caps auto redirect flows at two hops', async () => {
    // Initial state: on www.udemy.com
    expect(await canAttempt('business.udemy.com', { currentHost: 'www.udemy.com' })).toBe(true);
    // Hop 1: www -> business
    await recordAttempt('business.udemy.com', 'www.udemy.com');

    // Hop 2: business -> team
    expect(await canAttempt('team.udemy.com', { currentHost: 'business.udemy.com' })).toBe(true);
    await recordAttempt('team.udemy.com', 'business.udemy.com');

    // Hop 3: team -> campus is blocked (cap at 2 hops)
    expect(await canAttempt('campus.udemy.com', { currentHost: 'team.udemy.com' })).toBe(false);
  });

  it('rejects auto continuation from a host that is not the active flow endpoint', async () => {
    await recordAttempt('business.udemy.com', 'www.udemy.com');
    // Active flow endpoint is business.udemy.com; continuing from www.udemy.com is not allowed.
    expect(await canAttempt('team.udemy.com', { currentHost: 'www.udemy.com' })).toBe(false);
    // Continuing from the endpoint is allowed.
    expect(await canAttempt('team.udemy.com', { currentHost: 'business.udemy.com' })).toBe(true);
  });

  it('accepts only udemy.com and subdomain hosts', () => {
    expect(isValidUdemyHost('udemy.com')).toBe(true);
    expect(isValidUdemyHost('www.udemy.com')).toBe(true);
    expect(isValidUdemyHost('business.udemy.com')).toBe(true);
    expect(isValidUdemyHost('udemy.com.evil.net')).toBe(false);
    expect(isValidUdemyHost('evil.net')).toBe(false);
    expect(isValidUdemyHost('')).toBe(false);
  });

  it('never builds a redirect URL to a non-Udemy host', () => {
    expect(buildRedirectUrl('evil.net', 'https://www.udemy.com/course/test/')).toBeNull();
    expect(buildRedirectUrl('udemy.com.evil.net', 'https://www.udemy.com/course/test/')).toBeNull();
    expect(buildRedirectUrl('business.udemy.com', 'https://www.udemy.com/course/test/')).toBe(
      'https://business.udemy.com/course/test/'
    );
  });

  it('ignores non-Udemy hosts when picking a healthy target', () => {
    const snapshot: PublicHealthSnapshot = {
      runAt: '2026-06-11T00:00:00Z',
      domains: [
        { host: 'evil.net', status: 'healthy', lastChecked: null },
        { host: 'business.udemy.com', status: 'healthy', lastChecked: null },
      ],
    };

    expect(pickHealthyHost(snapshot, 'www.udemy.com')).toBe('business.udemy.com');
  });

  it('permits fresh auto flow after two minutes expire', async () => {
    await recordAttempt('business.udemy.com', 'www.udemy.com');
    await recordAttempt('team.udemy.com', 'business.udemy.com');

    expect(await canAttempt('campus.udemy.com', { currentHost: 'team.udemy.com' })).toBe(false);

    // Advance 2 minutes + 1 second
    vi.advanceTimersByTime(DOMAIN_SWITCH_TTL_MS + 1000);

    // Now state is expired, so fresh attempt is permitted
    expect(await readDomainSwitchState()).toBeNull();
    expect(await canAttempt('www.udemy.com', { currentHost: 'team.udemy.com' })).toBe(true);
  });

  it('clearDomainSwitchState removes stored record from GM storage', async () => {
    await recordAttempt('business.udemy.com', 'www.udemy.com');
    expect(await readDomainSwitchState()).not.toBeNull();

    await clearDomainSwitchState();
    expect(await readDomainSwitchState()).toBeNull();
  });

  it('canAttempt rejects when GM storage read fails instead of silently allowing', async () => {
    vi.mocked(GM_getValue).mockImplementation(() => {
      throw new Error('GM_getValue is not available');
    });

    await expect(canAttempt('business.udemy.com', { currentHost: 'www.udemy.com' })).rejects.toThrow(
      'GM_getValue is not available'
    );
  });

  it('recordAttempt rejects when GM storage write fails instead of silently dropping the guard', async () => {
    vi.mocked(GM_setValue).mockImplementation(() => {
      throw new Error('GM_setValue is not available');
    });

    await expect(recordAttempt('business.udemy.com', 'www.udemy.com')).rejects.toThrow(
      'GM_setValue is not available'
    );
  });
});
