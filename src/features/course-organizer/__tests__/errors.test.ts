import { describe, it, expect } from 'vitest';
import { getCourseSaveErrorMessage } from '../errors';

describe('getCourseSaveErrorMessage', () => {
  // Line numbers referenced from wwwroot/cookie-updater.legacy.js

  it('should map token missing error (ref: line 795)', () => {
    const error = new Error('Udemy access token not found. Refresh/login to Udemy and try again.');
    expect(getCourseSaveErrorMessage(error)).toBe(
      'Udemy access token not found. Refresh/login to Udemy and try again.'
    );
  });

  it('should map 401 unauthorized (ref: line 804)', () => {
    // Via status
    expect(getCourseSaveErrorMessage({ status: 401 })).toBe(
      'Udemy session expired. Refresh/login to Udemy and try again.'
    );
    // Via message
    expect(getCourseSaveErrorMessage(new Error('HTTP 401'))).toBe(
      'Udemy session expired. Refresh/login to Udemy and try again.'
    );
  });

  it('should map 404 not found (ref: line 807)', () => {
    expect(getCourseSaveErrorMessage({ status: 404 })).toBe(
      'Udemy course not found or unavailable.'
    );
  });

  it('should map 429 rate limit (ref: line 810)', () => {
    expect(getCourseSaveErrorMessage({ status: 429 })).toBe(
      'Udemy rate limit hit. Try again later.'
    );
  });

  it('should map 502/503/504 to metadata service unavailable (ref: line 813)', () => {
    expect(getCourseSaveErrorMessage({ status: 502 })).toBe(
      'Udemy metadata service unavailable. Try again later.'
    );
    expect(getCourseSaveErrorMessage({ status: 503 })).toBe(
      'Udemy metadata service unavailable. Try again later.'
    );
    expect(getCourseSaveErrorMessage({ status: 504 })).toBe(
      'Udemy metadata service unavailable. Try again later.'
    );
  });

  it('should map generic/unknown errors to fallback (ref: line 816)', () => {
    expect(getCourseSaveErrorMessage(null)).toBe(
      'Failed to save course. Please try again.'
    );
    expect(getCourseSaveErrorMessage(new Error('some random error'))).toBe(
      'Failed to save course. Please try again.'
    );
  });
});
