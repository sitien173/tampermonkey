import { describe, it, expect, vi } from 'vitest';
import {
  parseLearningRoute,
  parseCourseCounter,
  calculateProgress,
  parseSectionCounter,
  extractCurriculumTotals,
  extractRawProgress,
  CourseProgressValidator,
} from '../udemy-progress';

describe('udemy-progress pure parsing and extraction', () => {
  describe('parseLearningRoute', () => {
    it('extracts course slug and canonical lesson URL from learning pathname', () => {
      const result = parseLearningRoute(
        '/course/the-complete-web-development-bootcamp/learn/lecture/37350350#overview'
      );
      expect(result).toEqual({
        courseSlug: 'the-complete-web-development-bootcamp',
        lessonUrl: '/course/the-complete-web-development-bootcamp/learn/lecture/37350350',
      });
    });

    it('strips query parameters, hashes, and trailing slashes from lesson URL', () => {
      const result = parseLearningRoute(
        '/course/react-deep-dive/learn/lecture/998877?start=15&autoplay=1#notes'
      );
      expect(result).toEqual({
        courseSlug: 'react-deep-dive',
        lessonUrl: '/course/react-deep-dive/learn/lecture/998877',
      });
    });

    it('returns null for non-learning course routes or other pages', () => {
      expect(parseLearningRoute('/course/react-deep-dive/')).toBeNull();
      expect(parseLearningRoute('/course/react-deep-dive')).toBeNull();
      expect(parseLearningRoute('/home/my-courses/learning/')).toBeNull();
      expect(parseLearningRoute('/user/logout/')).toBeNull();
    });
  });

  describe('parseCourseCounter', () => {
    it('parses valid course counter format "58 of 386 complete."', () => {
      const result = parseCourseCounter('58 of 386 complete.');
      expect(result).toEqual({ completed: 58, total: 386 });
    });

    it('parses "0 of 386 complete."', () => {
      const result = parseCourseCounter('0 of 386 complete.');
      expect(result).toEqual({ completed: 0, total: 386 });
    });

    it('parses full completion "386 of 386 complete."', () => {
      const result = parseCourseCounter('386 of 386 complete.');
      expect(result).toEqual({ completed: 386, total: 386 });
    });

    it('returns null for zero total count', () => {
      expect(parseCourseCounter('0 of 0 complete.')).toBeNull();
    });

    it('returns null when completed count exceeds total count', () => {
      expect(parseCourseCounter('400 of 386 complete.')).toBeNull();
    });

    it('returns null for malformed or unrelated text', () => {
      expect(parseCourseCounter('')).toBeNull();
      expect(parseCourseCounter('NaN of NaN complete.')).toBeNull();
      expect(parseCourseCounter('random text')).toBeNull();
    });
  });

  describe('calculateProgress', () => {
    it('calculates rounded integer percentage and completion flag', () => {
      // 58 / 386 * 100 = 15.025... -> 15
      expect(calculateProgress(58, 386)).toEqual({
        progress: 15,
        isCompleted: false,
      });

      // 386 / 386 * 100 = 100 -> 100
      expect(calculateProgress(386, 386)).toEqual({
        progress: 100,
        isCompleted: true,
      });

      // 0 / 386 * 100 = 0 -> 0
      expect(calculateProgress(0, 386)).toEqual({
        progress: 0,
        isCompleted: false,
      });

      // 1 / 3 * 100 = 33.333... -> 33
      expect(calculateProgress(1, 3)).toEqual({
        progress: 33,
        isCompleted: false,
      });

      // 2 / 3 * 100 = 66.666... -> 67
      expect(calculateProgress(2, 3)).toEqual({
        progress: 67,
        isCompleted: false,
      });
    });
  });

  describe('parseSectionCounter', () => {
    it('parses section counter "9 of 9 lectures completed"', () => {
      expect(parseSectionCounter('9 of 9 lectures completed')).toEqual({
        completed: 9,
        total: 9,
      });
    });

    it('parses section counter "0 of 10 lectures completed"', () => {
      expect(parseSectionCounter('0 of 10 lectures completed')).toEqual({
        completed: 0,
        total: 10,
      });
    });

    it('parses section counter with singular "1 of 1 lecture completed"', () => {
      expect(parseSectionCounter('1 of 1 lecture completed')).toEqual({
        completed: 1,
        total: 1,
      });
    });

    it('returns null for malformed section counter', () => {
      expect(parseSectionCounter('no duration info')).toBeNull();
      expect(parseSectionCounter('5 of 3 lectures completed')).toBeNull();
    });
  });

  describe('extractCurriculumTotals', () => {
    it('aggregates section totals across all section counter elements', () => {
      const container = document.createElement('div');
      // Create 3 section counters totaling 15 completed and 25 total
      const s1 = document.createElement('span');
      s1.setAttribute('data-purpose', 'section-duration-sr-only');
      s1.textContent = '5 of 5 lectures completed';

      const s2 = document.createElement('span');
      s2.setAttribute('data-purpose', 'section-duration-sr-only');
      s2.textContent = '10 of 15 lectures completed';

      const s3 = document.createElement('span');
      s3.setAttribute('data-purpose', 'section-duration-sr-only');
      s3.textContent = '0 of 5 lectures completed';

      container.appendChild(s1);
      container.appendChild(s2);
      container.appendChild(s3);

      const totals = extractCurriculumTotals(container);
      expect(totals).toEqual({
        completed: 15,
        total: 25,
        sectionCount: 3,
      });
    });

    it('returns null when no section counter elements exist', () => {
      const container = document.createElement('div');
      expect(extractCurriculumTotals(container)).toBeNull();
    });
  });

  describe('extractRawProgress', () => {
    it('extracts raw progress snapshot from synthetic learning page DOM', () => {
      const container = document.createElement('div');

      const counter = document.createElement('span');
      counter.setAttribute('data-purpose', 'progress-popover-text');
      counter.textContent = '58 of 386 complete.';
      container.appendChild(counter);

      const raw = extractRawProgress(
        container,
        '/course/the-complete-web-development-bootcamp/learn/lecture/37350350'
      );

      expect(raw).not.toBeNull();
      expect(raw?.snapshot).toEqual({
        courseSlug: 'the-complete-web-development-bootcamp',
        completed: 58,
        total: 386,
        progress: 15,
        isCompleted: false,
        lastLessonUrl: '/course/the-complete-web-development-bootcamp/learn/lecture/37350350',
      });
      expect(raw?.sectionTotals).toBeNull();
    });

    it('returns null when not on a learning route', () => {
      const container = document.createElement('div');
      const counter = document.createElement('span');
      counter.setAttribute('data-purpose', 'progress-popover-text');
      counter.textContent = '58 of 386 complete.';
      container.appendChild(counter);

      const raw = extractRawProgress(container, '/course/the-complete-web-development-bootcamp');
      expect(raw).toBeNull();
    });

    it('returns null when course counter is missing from DOM', () => {
      const container = document.createElement('div');
      const raw = extractRawProgress(
        container,
        '/course/the-complete-web-development-bootcamp/learn/lecture/37350350'
      );
      expect(raw).toBeNull();
    });

    it('ignores video controls with aria-valuenow="NaN"', () => {
      const container = document.createElement('div');

      // Video control element with aria-valuenow="NaN"
      const videoControl = document.createElement('div');
      videoControl.setAttribute('role', 'slider');
      videoControl.setAttribute('aria-valuenow', 'NaN');
      videoControl.textContent = '0:00 / 12:34';
      container.appendChild(videoControl);

      // Course counter
      const counter = document.createElement('span');
      counter.setAttribute('data-purpose', 'progress-popover-text');
      counter.textContent = '58 of 386 complete.';
      container.appendChild(counter);

      const raw = extractRawProgress(
        container,
        '/course/the-complete-web-development-bootcamp/learn/lecture/37350350'
      );

      expect(raw?.snapshot.progress).toBe(15);
      expect(raw?.snapshot.completed).toBe(58);
    });
  });

  describe('CourseProgressValidator', () => {
    it('validates immediately when section aggregates match course counter', () => {
      const onValidated = vi.fn();
      const validator = new CourseProgressValidator({ onValidatedProgress: onValidated });

      const raw = {
        snapshot: {
          courseSlug: 'bootcamp',
          completed: 58,
          total: 386,
          progress: 15,
          isCompleted: false,
          lastLessonUrl: '/course/bootcamp/learn/lecture/1',
        },
        sectionTotals: {
          completed: 58,
          total: 386,
          sectionCount: 45,
        },
      };

      validator.processObservation(raw);
      expect(onValidated).toHaveBeenCalledTimes(1);
      expect(onValidated).toHaveBeenCalledWith(raw.snapshot);
    });

    it('rejects temporary initial 0 when it changes to 58 within 5 seconds without section totals', () => {
      vi.useFakeTimers();
      const onValidated = vi.fn();
      const validator = new CourseProgressValidator({ onValidatedProgress: onValidated });

      // Second 3: temporary 0 of 386
      validator.processObservation({
        snapshot: {
          courseSlug: 'bootcamp',
          completed: 0,
          total: 386,
          progress: 0,
          isCompleted: false,
          lastLessonUrl: '/course/bootcamp/learn/lecture/1',
        },
        sectionTotals: null,
      });

      expect(onValidated).not.toHaveBeenCalled();

      // Advance 1 second (total 1s at 0 of 386)
      vi.advanceTimersByTime(1000);
      expect(onValidated).not.toHaveBeenCalled();

      // Second 4: changes to 58 of 386
      validator.processObservation({
        snapshot: {
          courseSlug: 'bootcamp',
          completed: 58,
          total: 386,
          progress: 15,
          isCompleted: false,
          lastLessonUrl: '/course/bootcamp/learn/lecture/1',
        },
        sectionTotals: null,
      });

      expect(onValidated).not.toHaveBeenCalled();

      // Advance 4.9 seconds (total 4.9s at 58 of 386)
      vi.advanceTimersByTime(4900);
      expect(onValidated).not.toHaveBeenCalled();

      // Advance remaining 100ms (5s reached for 58 of 386)
      vi.advanceTimersByTime(100);
      expect(onValidated).toHaveBeenCalledTimes(1);
      expect(onValidated).toHaveBeenCalledWith(
        expect.objectContaining({ completed: 58, progress: 15 })
      );

      vi.useRealTimers();
    });

    it('validates stable counter after 5 seconds when section totals are absent', () => {
      vi.useFakeTimers();
      const onValidated = vi.fn();
      const validator = new CourseProgressValidator({ onValidatedProgress: onValidated });

      validator.processObservation({
        snapshot: {
          courseSlug: 'bootcamp',
          completed: 10,
          total: 100,
          progress: 10,
          isCompleted: false,
          lastLessonUrl: '/course/bootcamp/learn/lecture/1',
        },
        sectionTotals: null,
      });

      expect(onValidated).not.toHaveBeenCalled();
      vi.advanceTimersByTime(4999);
      expect(onValidated).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onValidated).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('settles subsequent progress updates for 1 second after initial validation', () => {
      vi.useFakeTimers();
      const onValidated = vi.fn();
      const validator = new CourseProgressValidator({ onValidatedProgress: onValidated });

      // Initial validation via matching sections
      validator.processObservation({
        snapshot: {
          courseSlug: 'bootcamp',
          completed: 10,
          total: 100,
          progress: 10,
          isCompleted: false,
          lastLessonUrl: '/course/bootcamp/learn/lecture/1',
        },
        sectionTotals: { completed: 10, total: 100, sectionCount: 10 },
      });
      expect(onValidated).toHaveBeenCalledTimes(1);

      // Next lesson completed (11 of 100)
      validator.processObservation({
        snapshot: {
          courseSlug: 'bootcamp',
          completed: 11,
          total: 100,
          progress: 11,
          isCompleted: false,
          lastLessonUrl: '/course/bootcamp/learn/lecture/2',
        },
        sectionTotals: null,
      });

      expect(onValidated).toHaveBeenCalledTimes(1); // not called yet, settling
      vi.advanceTimersByTime(999);
      expect(onValidated).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      expect(onValidated).toHaveBeenCalledTimes(2);
      expect(onValidated).toHaveBeenLastCalledWith(
        expect.objectContaining({ completed: 11, progress: 11 })
      );

      vi.useRealTimers();
    });

    it('resets hydration state when navigating to a different course', () => {
      vi.useFakeTimers();
      const onValidated = vi.fn();
      const validator = new CourseProgressValidator({ onValidatedProgress: onValidated });

      // Course A validated
      validator.processObservation({
        snapshot: {
          courseSlug: 'course-a',
          completed: 5,
          total: 10,
          progress: 50,
          isCompleted: false,
          lastLessonUrl: '/course/course-a/learn/lecture/1',
        },
        sectionTotals: { completed: 5, total: 10, sectionCount: 2 },
      });
      expect(onValidated).toHaveBeenCalledTimes(1);

      // Navigate to Course B (unvalidated initial state)
      validator.processObservation({
        snapshot: {
          courseSlug: 'course-b',
          completed: 0,
          total: 50,
          progress: 0,
          isCompleted: false,
          lastLessonUrl: '/course/course-b/learn/lecture/1',
        },
        sectionTotals: null,
      });

      // Must not emit Course B immediately
      expect(onValidated).toHaveBeenCalledTimes(1);

      // Must wait 5 seconds for stable counter fallback
      vi.advanceTimersByTime(5000);
      expect(onValidated).toHaveBeenCalledTimes(2);
      expect(onValidated).toHaveBeenLastCalledWith(
        expect.objectContaining({ courseSlug: 'course-b', completed: 0 })
      );

      vi.useRealTimers();
    });

    it('rejects conflicting section aggregates and never emits even after 5+ seconds', () => {
      vi.useFakeTimers();
      const onValidated = vi.fn();
      const validator = new CourseProgressValidator({ onValidatedProgress: onValidated });

      // Course counter says 58 of 386, but section totals say 20 of 386 (conflict!)
      validator.processObservation({
        snapshot: {
          courseSlug: 'bootcamp',
          completed: 58,
          total: 386,
          progress: 15,
          isCompleted: false,
          lastLessonUrl: '/course/bootcamp/learn/lecture/1',
        },
        sectionTotals: {
          completed: 20,
          total: 386,
          sectionCount: 45,
        },
      });

      expect(onValidated).not.toHaveBeenCalled();

      // Even after 10 seconds, conflicting snapshot must never be emitted
      vi.advanceTimersByTime(10000);
      expect(onValidated).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('cancels pending fallback timer if conflicting section totals appear in-flight', () => {
      vi.useFakeTimers();
      const onValidated = vi.fn();
      const validator = new CourseProgressValidator({ onValidatedProgress: onValidated });

      // Start with absent section totals at second 0 (starts 5s fallback)
      validator.processObservation({
        snapshot: {
          courseSlug: 'bootcamp',
          completed: 58,
          total: 386,
          progress: 15,
          isCompleted: false,
          lastLessonUrl: '/course/bootcamp/learn/lecture/1',
        },
        sectionTotals: null,
      });

      vi.advanceTimersByTime(2000);
      expect(onValidated).not.toHaveBeenCalled();

      // At second 2, conflicting section totals appear
      validator.processObservation({
        snapshot: {
          courseSlug: 'bootcamp',
          completed: 58,
          total: 386,
          progress: 15,
          isCompleted: false,
          lastLessonUrl: '/course/bootcamp/learn/lecture/1',
        },
        sectionTotals: {
          completed: 40,
          total: 386,
          sectionCount: 45,
        },
      });

      // Advance past the original 5s mark
      vi.advanceTimersByTime(5000);
      expect(onValidated).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
