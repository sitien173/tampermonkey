import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRedirectUrl, canAttempt, pickHealthyHost, recordAttempt } from '../switch';
import { PublicHealthSnapshot } from '../../../state/types';

describe('healthy-domain switch helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T00:00:00Z'));
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
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

  it('returns null for malformed redirect URLs or empty target host', () => {
    expect(buildRedirectUrl('', 'https://www.udemy.com/course/test/')).toBeNull();
    expect(buildRedirectUrl('business.udemy.com', 'not-a-url')).toBeNull();
  });

  it('builds a redirect URL by replacing only the host', () => {
    expect(
      buildRedirectUrl('business.udemy.com', 'https://www.udemy.com/course/test/?x=1#lesson')
    ).toBe('https://business.udemy.com/course/test/?x=1#lesson');
  });

  it('always allows manual attempts', () => {
    recordAttempt('business.udemy.com');
    recordAttempt('team.udemy.com');

    expect(canAttempt('business.udemy.com', { manual: true })).toBe(true);
  });

  it('blocks repeat auto attempts to the same target within 60 seconds', () => {
    recordAttempt('business.udemy.com');

    expect(canAttempt('business.udemy.com')).toBe(false);
  });

  it('blocks auto attempts after two attempts in the same session', () => {
    recordAttempt('business.udemy.com');
    vi.advanceTimersByTime(61_000);
    recordAttempt('team.udemy.com');

    expect(canAttempt('campus.udemy.com')).toBe(false);
  });
});
