import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isPlausibleAccessToken,
  findAccessTokenInValue,
  getAccessTokenFromStorage,
  getUdemyAccessToken
} from '../udemy-token';

describe('udemy-token sniffer', () => {
  describe('isPlausibleAccessToken', () => {
    it('should validate string length and format', () => {
      // Too short
      expect(isPlausibleAccessToken('12345')).toBe(false);
      // Starts with brace
      expect(isPlausibleAccessToken('{' + 'a'.repeat(25))).toBe(false);
      // Starts with bracket
      expect(isPlausibleAccessToken('[' + 'a'.repeat(25))).toBe(false);
      // Valid
      expect(isPlausibleAccessToken('a'.repeat(30))).toBe(true);
    });
  });

  describe('findAccessTokenInValue', () => {
    it('should return raw string token if plausible', () => {
      const token = 'a'.repeat(30);
      expect(findAccessTokenInValue(token)).toBe(token);
    });

    it('should extract JSON-wrapped access_token', () => {
      const token = 'a'.repeat(30);
      const jsonStr = JSON.stringify({ access_token: token });
      expect(findAccessTokenInValue(jsonStr)).toBe(token);
    });

    it('should extract nested access_token', () => {
      const token = 'b'.repeat(30);
      const obj = { some: { auth: { access_token: token } } };
      expect(findAccessTokenInValue(obj)).toBe(token);
    });

    it('should extract raw token inside JSON array', () => {
      const token = 'c'.repeat(30);
      const arrJson = JSON.stringify([token]);
      expect(findAccessTokenInValue(arrJson)).toBe(token);
    });

    it('should return null for missing or invalid format', () => {
      expect(findAccessTokenInValue(null)).toBeNull();
      expect(findAccessTokenInValue(undefined)).toBeNull();
      expect(findAccessTokenInValue('short')).toBeNull();
      expect(findAccessTokenInValue({ token: 'abc' })).toBeNull();
    });
  });

  describe('getAccessTokenFromStorage', () => {
    it('should return token if found in storage', () => {
      const token = 'd'.repeat(30);
      const mockStorage = {
        length: 2,
        key: (i: number) => (i === 0 ? 'something' : 'auth_key'),
        getItem: (key: string) => {
          if (key === 'auth_key') {
            return JSON.stringify({ access_token: token });
          }
          return 'some_other_value';
        }
      } as any as Storage;

      expect(getAccessTokenFromStorage(mockStorage)).toBe(token);
    });

    it('should return null if not found', () => {
      const mockStorage = {
        length: 1,
        key: () => 'some_key',
        getItem: () => 'some_value'
      } as any as Storage;

      expect(getAccessTokenFromStorage(mockStorage)).toBeNull();
    });
  });

  describe('getUdemyAccessToken', () => {
    let originalLocalStorage: any;
    let originalSessionStorage: any;

    beforeEach(() => {
      originalLocalStorage = window.localStorage;
      originalSessionStorage = window.sessionStorage;
    });

    afterEach(() => {
      Object.defineProperty(window, 'localStorage', { value: originalLocalStorage, configurable: true });
      Object.defineProperty(window, 'sessionStorage', { value: originalSessionStorage, configurable: true });
    });

    it('should sniff token from localStorage first, then sessionStorage', () => {
      const token = 'e'.repeat(30);
      
      const mockLocalStorage = {
        length: 1,
        key: () => 'token_key',
        getItem: () => token
      } as any;

      Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, configurable: true });
      Object.defineProperty(window, 'sessionStorage', { value: null, configurable: true });

      expect(getUdemyAccessToken()).toBe(token);
    });
  });
});
