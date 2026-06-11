import { describe, it, expect } from 'vitest';
import { diffCookies, DesiredCookie, ExistingCookie } from './cookies';

describe('diffCookies', () => {
  it('diffCookies_ReturnsSetOp_ForNewCookie', () => {
    const existing: ExistingCookie[] = [
      { name: 'foo', value: 'bar', domain: 'example.com' }
    ];
    const desired: DesiredCookie[] = [
      { name: 'foo', value: 'bar', domain: 'example.com' },
      { name: 'newCookie', value: 'newValue', domain: 'example.com' }
    ];

    const result = diffCookies(existing, desired);

    expect(result).toEqual([
      {
        type: 'set',
        cookie: { name: 'newCookie', value: 'newValue', domain: 'example.com' }
      }
    ]);
  });

  it('diffCookies_ReturnsNoop_WhenValueUnchanged', () => {
    const existing: ExistingCookie[] = [
      { name: 'foo', value: 'bar', domain: 'example.com' }
    ];
    const desired: DesiredCookie[] = [
      { name: 'foo', value: 'bar', domain: 'example.com' }
    ];

    const result = diffCookies(existing, desired);

    expect(result).toEqual([]);
  });

  it('diffCookies_ReturnsSetOp_WhenValueChanged', () => {
    const existing: ExistingCookie[] = [
      { name: 'foo', value: 'bar', domain: 'example.com' }
    ];
    const desired: DesiredCookie[] = [
      { name: 'foo', value: 'updatedBar', domain: 'example.com' }
    ];

    const result = diffCookies(existing, desired);

    expect(result).toEqual([
      {
        type: 'set',
        cookie: { name: 'foo', value: 'updatedBar', domain: 'example.com' }
      }
    ]);
  });

  it('diffCookies_ReturnsDeleteOp_ForStaleKey', () => {
    const existing: ExistingCookie[] = [
      { name: 'foo', value: 'bar', domain: 'example.com' },
      { name: 'staleCookie', value: 'staleValue', domain: 'example.com' }
    ];
    const desired: DesiredCookie[] = [
      { name: 'foo', value: 'bar', domain: 'example.com' }
    ];

    const result = diffCookies(existing, desired);

    expect(result).toEqual([
      {
        type: 'delete',
        name: 'staleCookie',
        domain: 'example.com'
      }
    ]);
  });

  it('diffCookies_HandlesEmptyExisting', () => {
    const existing: ExistingCookie[] = [];
    const desired: DesiredCookie[] = [
      { name: 'foo', value: 'bar', domain: 'example.com' }
    ];

    const result = diffCookies(existing, desired);

    expect(result).toEqual([
      {
        type: 'set',
        cookie: { name: 'foo', value: 'bar', domain: 'example.com' }
      }
    ]);
  });

  it('diffCookies_HandlesEmptyDesired', () => {
    const existing: ExistingCookie[] = [
      { name: 'foo', value: 'bar', domain: 'example.com' }
    ];
    const desired: DesiredCookie[] = [];

    const result = diffCookies(existing, desired);

    expect(result).toEqual([
      {
        type: 'delete',
        name: 'foo',
        domain: 'example.com'
      }
    ]);
  });

  it('diffCookies_IgnoresExpiredDesiredCookies', () => {
    const desired: DesiredCookie[] = [
      {
        name: 'expired',
        value: 'value',
        domain: 'example.com',
        expirationDate: 100,
      },
      {
        name: 'active',
        value: 'value',
        domain: 'example.com',
        expirationDate: 300,
      },
    ];

    const result = diffCookies([], desired, 200);

    expect(result).toEqual([
      { type: 'set', cookie: desired[1] },
    ]);
  });
});
