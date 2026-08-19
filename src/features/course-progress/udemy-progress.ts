export interface CourseProgressSnapshot {
  courseSlug: string;
  completed: number;
  total: number;
  progress: number;
  isCompleted: boolean;
  lastLessonUrl: string;
}

export interface CurriculumTotals {
  completed: number;
  total: number;
  sectionCount: number;
}

export interface RawProgressExtraction {
  snapshot: CourseProgressSnapshot;
  sectionTotals: CurriculumTotals | null;
}

const LEARNING_ROUTE_REGEX = /^\/course\/([^/?#]+)\/learn\/lecture\/([^/?#]+)/i;
const COURSE_COUNTER_REGEX = /(\d+)\s+of\s+(\d+)\s+complete\b/i;
const SECTION_COUNTER_REGEX = /(\d+)\s+of\s+(\d+)(?:\s+lectures?)?\s+completed\b/i;

/**
 * Extracts course slug and canonical lesson URL from a pathname string.
 * Example: /course/my-slug/learn/lecture/123?start=1#notes -> { courseSlug: 'my-slug', lessonUrl: '/course/my-slug/learn/lecture/123' }
 */
export function parseLearningRoute(pathname: string): { courseSlug: string; lessonUrl: string } | null {
  if (!pathname) return null;
  const match = pathname.match(LEARNING_ROUTE_REGEX);
  if (!match) return null;

  const courseSlug = match[1];
  const lectureId = match[2];
  const lessonUrl = `/course/${courseSlug}/learn/lecture/${lectureId}`;

  return { courseSlug, lessonUrl };
}

/**
 * Parses course counter text from [data-purpose="progress-popover-text"].
 * Example: "58 of 386 complete." -> { completed: 58, total: 386 }
 */
export function parseCourseCounter(text: string): { completed: number; total: number } | null {
  if (!text) return null;
  const match = text.match(COURSE_COUNTER_REGEX);
  if (!match) return null;

  const completed = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);

  if (isNaN(completed) || isNaN(total) || total <= 0 || completed < 0 || completed > total) {
    return null;
  }

  return { completed, total };
}

/**
 * Calculates progress percentage (rounded integer) and completion flag.
 */
export function calculateProgress(completed: number, total: number): { progress: number; isCompleted: boolean } {
  if (total <= 0) {
    return { progress: 0, isCompleted: false };
  }
  const progress = Math.round((completed / total) * 100);
  const isCompleted = completed === total;
  return { progress, isCompleted };
}

/**
 * Parses a section counter string from [data-purpose="section-duration-sr-only"].
 * Example: "9 of 9 lectures completed" -> { completed: 9, total: 9 }
 */
export function parseSectionCounter(text: string): { completed: number; total: number } | null {
  if (!text) return null;
  const match = text.match(SECTION_COUNTER_REGEX);
  if (!match) return null;

  const completed = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);

  if (isNaN(completed) || isNaN(total) || total < 0 || completed < 0 || completed > total) {
    return null;
  }

  return { completed, total };
}

/**
 * Aggregates section duration totals across all [data-purpose="section-duration-sr-only"] elements.
 */
export function extractCurriculumTotals(root: ParentNode = document): CurriculumTotals | null {
  const elements = root.querySelectorAll('[data-purpose="section-duration-sr-only"]');
  if (!elements || elements.length === 0) {
    return null;
  }

  let totalCompleted = 0;
  let totalItems = 0;
  let validSections = 0;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const parsed = parseSectionCounter(el.textContent || '');
    if (parsed) {
      totalCompleted += parsed.completed;
      totalItems += parsed.total;
      validSections++;
    }
  }

  if (validSections === 0) {
    return null;
  }

  return {
    completed: totalCompleted,
    total: totalItems,
    sectionCount: validSections,
  };
}

/**
 * Extracts raw unvalidated progress and section totals from DOM and location.
 */
export function extractRawProgress(
  root: ParentNode = document,
  locationPathname: string = typeof window !== 'undefined' ? window.location.pathname : ''
): RawProgressExtraction | null {
  const route = parseLearningRoute(locationPathname);
  if (!route) {
    return null;
  }

  const counterEl = root.querySelector('[data-purpose="progress-popover-text"]');
  if (!counterEl || !counterEl.textContent) {
    return null;
  }

  const counter = parseCourseCounter(counterEl.textContent);
  if (!counter) {
    return null;
  }

  const { progress, isCompleted } = calculateProgress(counter.completed, counter.total);
  const sectionTotals = extractCurriculumTotals(root);

  return {
    snapshot: {
      courseSlug: route.courseSlug,
      completed: counter.completed,
      total: counter.total,
      progress,
      isCompleted,
      lastLessonUrl: route.lessonUrl,
    },
    sectionTotals,
  };
}

export interface ProgressValidatorOptions {
  onValidatedProgress: (snapshot: CourseProgressSnapshot) => void;
  initialValidationTimeoutMs?: number; // default 5000
  settleDelayMs?: number; // default 1000
}

/**
 * Manages initial hydration validation (section aggregates match OR 5-second stable fallback)
 * and post-hydration settling (1-second debounce).
 */
export class CourseProgressValidator {
  private onValidatedProgress: (snapshot: CourseProgressSnapshot) => void;
  private initialValidationTimeoutMs: number;
  private settleDelayMs: number;

  private currentCourseSlug: string | null = null;
  private isHydrated = false;
  private lastSeenKey: string | null = null;
  private lastEmittedKey: string | null = null;

  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ProgressValidatorOptions) {
    this.onValidatedProgress = options.onValidatedProgress;
    this.initialValidationTimeoutMs = options.initialValidationTimeoutMs ?? 5000;
    this.settleDelayMs = options.settleDelayMs ?? 1000;
  }

  public reset(): void {
    this.clearTimers();
    this.currentCourseSlug = null;
    this.isHydrated = false;
    this.lastSeenKey = null;
    this.lastEmittedKey = null;
  }

  private clearTimers(): void {
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }

  public processObservation(raw: RawProgressExtraction): void {
    const { snapshot, sectionTotals } = raw;

    // If course changed, reset hydration state
    if (this.currentCourseSlug !== snapshot.courseSlug) {
      this.reset();
      this.currentCourseSlug = snapshot.courseSlug;
    }

    const currentKey = `${snapshot.completed}/${snapshot.total}@${snapshot.lastLessonUrl}`;

    // If non-null section totals exist, they must match the course counter.
    // If they conflict, cancel any fallback timer, do not start one, and do not emit.
    if (sectionTotals !== null) {
      const sectionsMatch =
        sectionTotals.total > 0 &&
        sectionTotals.completed === snapshot.completed &&
        sectionTotals.total === snapshot.total;

      if (!sectionsMatch) {
        this.clearTimers();
        this.lastSeenKey = null;
        return;
      }
    }

    if (!this.isHydrated) {
      // 1. If section aggregates exist and match, validate immediately
      if (sectionTotals !== null) {
        this.clearTimers();
        this.isHydrated = true;
        this.lastEmittedKey = currentKey;
        this.lastSeenKey = currentKey;
        this.onValidatedProgress(snapshot);
        return;
      }

      // 2. Aggregates are unavailable (null): Stable-counter fallback timer (5 seconds)
      if (this.lastSeenKey !== currentKey) {
        this.lastSeenKey = currentKey;
        if (this.fallbackTimer !== null) {
          clearTimeout(this.fallbackTimer);
        }
        this.fallbackTimer = setTimeout(() => {
          this.fallbackTimer = null;
          if (!this.isHydrated && this.lastSeenKey === currentKey) {
            this.isHydrated = true;
            this.lastEmittedKey = currentKey;
            this.onValidatedProgress(snapshot);
          }
        }, this.initialValidationTimeoutMs);
      }
    } else {
      // Already hydrated: settle changes for 1 second
      if (this.lastEmittedKey !== currentKey) {
        if (this.lastSeenKey !== currentKey) {
          this.lastSeenKey = currentKey;
          if (this.settleTimer !== null) {
            clearTimeout(this.settleTimer);
          }
          this.settleTimer = setTimeout(() => {
            this.settleTimer = null;
            if (this.isHydrated && this.lastSeenKey === currentKey) {
              this.lastEmittedKey = currentKey;
              this.onValidatedProgress(snapshot);
            }
          }, this.settleDelayMs);
        }
      }
    }
  }
}
