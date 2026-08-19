import { AppState, Course } from './types';
import { resolveCourseUrl } from '../features/folder-organizer/course-url';

export const selectConfig = (state: AppState) => state.config;
export const selectLicense = (state: AppState) => state.license;
export const selectUI = (state: AppState) => state.ui;
export const selectSyncPhase = (state: AppState) => state.sync.phase;
export const selectFolders = (state: AppState) => state.folders.folders;

export function normalizeProgress(progress: number | string | undefined | null): number {
  if (typeof progress === 'number') {
    return Math.max(0, Math.min(100, Math.round(progress)));
  }
  if (typeof progress === 'string' && progress.trim().length > 0) {
    const parsed = parseInt(progress.trim(), 10);
    if (!isNaN(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }
  return 0;
}

export function normalizeCompletion(
  isCompleted: boolean | number | undefined | null,
  progress?: number
): boolean {
  if (isCompleted === true || isCompleted === 1) {
    return true;
  }
  if (isCompleted === false || isCompleted === 0) {
    return false;
  }
  if (typeof progress === 'number' && progress >= 100) {
    return true;
  }
  return false;
}

export function selectCourseResumeUrl(course: Course, baseOrigin?: string): string | null {
  if (course.last_lesson_url) {
    const resolvedLast = resolveCourseUrl(course.last_lesson_url, baseOrigin);
    if (resolvedLast) {
      return resolvedLast;
    }
  }
  if (course.url) {
    const resolvedCourse = resolveCourseUrl(course.url, baseOrigin);
    if (resolvedCourse) {
      return resolvedCourse;
    }
  }
  return null;
}

export interface CourseProgressSelection {
  progress: number;
  isCompleted: boolean;
  resumeUrl: string | null;
}

export function selectCourseProgress(course: Course, baseOrigin?: string): CourseProgressSelection {
  const progress = normalizeProgress(course.progress);
  const isCompleted = normalizeCompletion(course.is_completed, progress);
  const resumeUrl = selectCourseResumeUrl(course, baseOrigin);

  return {
    progress,
    isCompleted,
    resumeUrl,
  };
}
