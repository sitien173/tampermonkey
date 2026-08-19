import { describe, it, expect } from 'vitest';
import {
  normalizeProgress,
  normalizeCompletion,
  selectCourseProgress,
  selectCourseResumeUrl,
} from '../selectors';
import { Course } from '../types';

describe('state selectors and progress helpers', () => {
  describe('normalizeProgress', () => {
    it('handles numeric progress including integer 0', () => {
      expect(normalizeProgress(0)).toBe(0);
      expect(normalizeProgress(50)).toBe(50);
      expect(normalizeProgress(100)).toBe(100);
      expect(normalizeProgress(45.6)).toBe(46);
    });

    it('clamps values outside 0-100 range', () => {
      expect(normalizeProgress(-10)).toBe(0);
      expect(normalizeProgress(150)).toBe(100);
    });

    it('handles string progress or missing progress', () => {
      expect(normalizeProgress('75')).toBe(75);
      expect(normalizeProgress(null)).toBe(0);
      expect(normalizeProgress(undefined)).toBe(0);
      expect(normalizeProgress('')).toBe(0);
    });
  });

  describe('normalizeCompletion', () => {
    it('normalizes backend 0 and 1 integer values exactly', () => {
      expect(normalizeCompletion(1)).toBe(true);
      expect(normalizeCompletion(0)).toBe(false);
    });

    it('normalizes boolean values', () => {
      expect(normalizeCompletion(true)).toBe(true);
      expect(normalizeCompletion(false)).toBe(false);
    });

    it('infers completion from 100% progress when completion flag is null/undefined', () => {
      expect(normalizeCompletion(undefined, 100)).toBe(true);
      expect(normalizeCompletion(null, 99)).toBe(false);
      expect(normalizeCompletion(false, 100)).toBe(false); // explicit false takes precedence
    });
  });

  describe('selectCourseProgress', () => {
    it('returns normalized progress, isCompleted, and resumeUrl', () => {
      const course: Course = {
        id: 'c1',
        udemy_course_id: '100',
        folder_id: 'f1',
        title: 'Test Course',
        url: 'https://www.udemy.com/course/test/',
        progress: 35,
        is_completed: false,
        last_lesson_url: '/course/test/learn/lecture/5',
        added_at: 1,
      };

      const result = selectCourseProgress(course);
      expect(result.progress).toBe(35);
      expect(result.isCompleted).toBe(false);
      expect(result.resumeUrl).toBe('http://localhost:3000/course/test/learn/lecture/5');
    });

    it('falls back to course url when last_lesson_url is missing', () => {
      const course: Course = {
        id: 'c2',
        udemy_course_id: '101',
        folder_id: 'f1',
        title: 'Test Course 2',
        url: 'https://www.udemy.com/course/test2/',
        progress: 0,
        is_completed: false,
        last_lesson_url: null,
        added_at: 1,
      };

      const result = selectCourseProgress(course);
      expect(result.progress).toBe(0);
      expect(result.isCompleted).toBe(false);
      expect(result.resumeUrl).toBe('https://www.udemy.com/course/test2/');
    });
  });

  describe('selectCourseResumeUrl', () => {
    it('returns null for unsafe URLs', () => {
      const course: Course = {
        id: 'c3',
        udemy_course_id: '102',
        folder_id: 'f1',
        title: 'Unsafe Course',
        url: 'javascript:alert(1)',
        last_lesson_url: 'javascript:void(0)',
        added_at: 1,
      };

      expect(selectCourseResumeUrl(course)).toBeNull();
    });
  });
});
