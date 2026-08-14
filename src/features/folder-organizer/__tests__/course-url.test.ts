import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveCourseUrl } from '../course-url';

describe('resolveCourseUrl', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://www.udemy.com',
        href: 'https://www.udemy.com/',
        protocol: 'https:',
        host: 'www.udemy.com',
        hostname: 'www.udemy.com',
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  describe('root-relative paths', () => {
    it('resolves standard root-relative course path against window.location.origin', () => {
      const result = resolveCourseUrl('/course/react-the-complete-guide/');
      expect(result).toBe('https://www.udemy.com/course/react-the-complete-guide/');
    });

    it('resolves root-relative path with query parameters and hash fragment', () => {
      const result = resolveCourseUrl('/course/python-bootcamp/?couponCode=DISCOUNT#overview');
      expect(result).toBe('https://www.udemy.com/course/python-bootcamp/?couponCode=DISCOUNT#overview');
    });

    it('resolves root-relative path with custom baseOrigin', () => {
      const result = resolveCourseUrl('/course/typescript/', 'https://business.udemy.com');
      expect(result).toBe('https://business.udemy.com/course/typescript/');
    });

    it('handles leading and trailing whitespace in root-relative path', () => {
      const result = resolveCourseUrl('   /course/machine-learning/   ');
      expect(result).toBe('https://www.udemy.com/course/machine-learning/');
    });

    it('rejects root-relative path when origin is missing or invalid', () => {
      Object.defineProperty(window, 'location', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(resolveCourseUrl('/course/react/')).toBeNull();
      expect(resolveCourseUrl('/course/react/', '')).toBeNull();
      expect(resolveCourseUrl('/course/react/', 'file:///var/log')).toBeNull();
    });
  });

  describe('valid absolute URLs', () => {
    it('accepts valid HTTPS absolute course URLs', () => {
      const result = resolveCourseUrl('https://www.udemy.com/course/nodejs-express-mongodb/');
      expect(result).toBe('https://www.udemy.com/course/nodejs-express-mongodb/');
    });

    it('accepts valid HTTP absolute course URLs', () => {
      const result = resolveCourseUrl('http://dev.udemy.com/course/test-course/');
      expect(result).toBe('http://dev.udemy.com/course/test-course/');
    });

    it('normalizes uppercase and mixed-case schemes', () => {
      const result = resolveCourseUrl('HTTPS://WWW.UDEMY.COM/course/docker-kubernetes/');
      expect(result).toBe('https://www.udemy.com/course/docker-kubernetes/');
    });

    it('trims leading and trailing whitespace in absolute URLs', () => {
      const result = resolveCourseUrl('   https://www.udemy.com/course/aws-certified/   ');
      expect(result).toBe('https://www.udemy.com/course/aws-certified/');
    });

    it('preserves query strings and fragments on absolute URLs', () => {
      const url = 'https://www.udemy.com/course/clean-code/?src=sac&kw=clean#curriculum';
      expect(resolveCourseUrl(url)).toBe(url);
    });

    it('accepts custom ports on HTTP/HTTPS URLs', () => {
      const url = 'http://localhost:3000/course/local-test/';
      expect(resolveCourseUrl(url)).toBe('http://localhost:3000/course/local-test/');
    });
  });

  describe('legacy file URLs', () => {
    it('rejects legacy file:/// course URLs', () => {
      expect(resolveCourseUrl('file:///course/python-masterclass/')).toBeNull();
    });

    it('rejects file:// URLs with host', () => {
      expect(resolveCourseUrl('file://localhost/course/python/')).toBeNull();
    });
  });

  describe('malicious and unsafe schemes', () => {
    it('rejects javascript: URLs', () => {
      expect(resolveCourseUrl('javascript:alert(document.domain)')).toBeNull();
      expect(resolveCourseUrl('JAVASCRIPT:alert(1)')).toBeNull();
      expect(resolveCourseUrl('  javascript:void(0)  ')).toBeNull();
    });

    it('rejects data: URLs', () => {
      expect(resolveCourseUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(resolveCourseUrl('DATA:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    });

    it('rejects vbscript: URLs', () => {
      expect(resolveCourseUrl('vbscript:msgbox("hello")')).toBeNull();
    });

    it('rejects blob: URLs', () => {
      expect(resolveCourseUrl('blob:https://www.udemy.com/123e4567-e89b-12d3-a456-426614174000')).toBeNull();
    });

    it('rejects about: and chrome: URLs', () => {
      expect(resolveCourseUrl('about:blank')).toBeNull();
      expect(resolveCourseUrl('chrome://settings')).toBeNull();
    });
  });

  describe('scheme-relative and backslash bypass attempts', () => {
    it('rejects scheme-relative // URLs', () => {
      expect(resolveCourseUrl('//evil.com/course/phishing')).toBeNull();
      expect(resolveCourseUrl('//www.udemy.com/course/safe-looking')).toBeNull();
      expect(resolveCourseUrl('   //evil.com/payload   ')).toBeNull();
    });

    it('rejects backslash-prefixed root paths', () => {
      expect(resolveCourseUrl('/\\evil.com')).toBeNull();
      expect(resolveCourseUrl('/\\/evil.com')).toBeNull();
      expect(resolveCourseUrl('\\evil.com')).toBeNull();
    });

    it('rejects embedded tab, newline, and carriage return bypasses', () => {
      expect(resolveCourseUrl('/\t/evil.com')).toBeNull();
      expect(resolveCourseUrl('/\n/evil.com')).toBeNull();
      expect(resolveCourseUrl('/\r/evil.com')).toBeNull();
      expect(resolveCourseUrl('https://www.udemy.com/\t/evil.com')).toBeNull();
      expect(resolveCourseUrl('https://www.udemy.com/\n@evil.com')).toBeNull();
    });
  });

  describe('empty and invalid inputs', () => {
    it('returns null for null and undefined', () => {
      expect(resolveCourseUrl(null)).toBeNull();
      expect(resolveCourseUrl(undefined)).toBeNull();
    });

    it('returns null for empty string and whitespace-only strings', () => {
      expect(resolveCourseUrl('')).toBeNull();
      expect(resolveCourseUrl('   ')).toBeNull();
      expect(resolveCourseUrl('\t\n')).toBeNull();
    });

    it('returns null for non-string types', () => {
      expect(resolveCourseUrl(123 as unknown as string)).toBeNull();
      expect(resolveCourseUrl({} as unknown as string)).toBeNull();
    });

    it('returns null for relative paths without leading slash', () => {
      expect(resolveCourseUrl('course/relative-path-without-slash')).toBeNull();
    });

    it('returns null for URLs missing hostname', () => {
      expect(resolveCourseUrl('http://')).toBeNull();
      expect(resolveCourseUrl('https://')).toBeNull();
      expect(resolveCourseUrl('http:///')).toBeNull();
      expect(resolveCourseUrl('https:///')).toBeNull();
    });

    it('returns null for unparseable garbage', () => {
      expect(resolveCourseUrl('ht tp://invalid url')).toBeNull();
      expect(resolveCourseUrl('http://[invalid-ipv6/')).toBeNull();
    });
  });
});
