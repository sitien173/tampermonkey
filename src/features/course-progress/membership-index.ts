import { Folder } from '../../state/types';

export interface MembershipEntry {
  courseId: string; // Global course GUID
  udemyCourseId: string | null;
  coursePath: string | null; // e.g. '/course/the-complete-web-development-bootcamp'
  courseSlug: string | null; // e.g. 'the-complete-web-development-bootcamp'
  containingFolderIds: string[];
  primaryFolderId: string;
}

export interface MembershipIndex {
  byCourseId: Map<string, MembershipEntry>;
  byUdemyCourseId: Map<string, MembershipEntry | null>;
  byCourseSlug: Map<string, MembershipEntry | null>;
}

const COURSE_URL_PATH_REGEX = /(?:https?:\/\/[^/]+)?\/course\/([^/?#]+)(?:\/.*)?$/i;

/**
 * Normalizes full URLs and relative paths to canonical /course/{slug} path.
 */
export function normalizeCoursePath(urlOrPath: string): string | null {
  if (!urlOrPath) return null;
  const match = urlOrPath.match(COURSE_URL_PATH_REGEX);
  if (!match) return null;

  const slug = match[1].toLowerCase().trim();
  if (!slug) return null;

  return `/course/${slug}`;
}

export function normalizeUdemyCourseId(id: string | number | undefined | null): string | null {
  if (id === undefined || id === null) return null;
  const str = String(id).trim();
  return str.length > 0 ? str : null;
}

export function extractSlugFromPath(path: string): string | null {
  const normalized = normalizeCoursePath(path);
  if (!normalized) return null;
  return normalized.replace(/^\/course\//, '');
}

/**
 * Derives a membership index from the active folder tree.
 * Folders are sorted by sort_order ascending, then folder.id ascending.
 */
export function buildMembershipIndex(folders: Folder[]): MembershipIndex {
  const index: MembershipIndex = {
    byCourseId: new Map(),
    byUdemyCourseId: new Map(),
    byCourseSlug: new Map(),
  };

  if (!folders || folders.length === 0) {
    return index;
  }

  // Sort folders deterministically: lowest sort_order, then id tie-breaker
  const sortedFolders = [...folders].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.id.localeCompare(b.id);
  });

  for (const folder of sortedFolders) {
    const courses = folder.courses || [];
    for (const course of courses) {
      const courseId = String(course.id);
      let entry = index.byCourseId.get(courseId);

      if (entry) {
        if (!entry.containingFolderIds.includes(folder.id)) {
          entry.containingFolderIds.push(folder.id);
        }
      } else {
        const coursePath = normalizeCoursePath(course.url);
        const courseSlug = coursePath ? coursePath.replace(/^\/course\//, '') : null;
        const udemyCourseId = normalizeUdemyCourseId(course.udemy_course_id);

        entry = {
          courseId,
          udemyCourseId,
          coursePath,
          courseSlug,
          containingFolderIds: [folder.id],
          primaryFolderId: folder.id,
        };

        index.byCourseId.set(courseId, entry);

        if (udemyCourseId) {
          if (index.byUdemyCourseId.has(udemyCourseId)) {
            const existing = index.byUdemyCourseId.get(udemyCourseId);
            if (existing && existing.courseId !== courseId) {
              // Collision between distinct courses: mark ambiguous
              index.byUdemyCourseId.set(udemyCourseId, null);
            }
          } else {
            index.byUdemyCourseId.set(udemyCourseId, entry);
          }
        }

        if (courseSlug) {
          if (index.byCourseSlug.has(courseSlug)) {
            const existing = index.byCourseSlug.get(courseSlug);
            if (existing && existing.courseId !== courseId) {
              // Collision between distinct courses: mark ambiguous
              index.byCourseSlug.set(courseSlug, null);
            }
          } else {
            index.byCourseSlug.set(courseSlug, entry);
          }
        }
      }
    }
  }

  return index;
}

export interface MatchQuery {
  udemyCourseId?: string | number | null;
  courseSlug?: string | null;
  locationPath?: string | null;
}

/**
 * Matches a page or query to a membership entry.
 * Priority: canonical Udemy ID first, then course slug / path.
 * Both must agree if both exist. Ambiguous matches suppress updates.
 */
export function matchMembership(index: MembershipIndex, query: MatchQuery): MembershipEntry | null {
  const qUdemyId = normalizeUdemyCourseId(query.udemyCourseId);
  const qSlug = query.courseSlug
    ? query.courseSlug.toLowerCase().trim()
    : query.locationPath
    ? extractSlugFromPath(query.locationPath)
    : null;

  if (qUdemyId && index.byUdemyCourseId.has(qUdemyId) && index.byUdemyCourseId.get(qUdemyId) === null) {
    // Ambiguous Udemy ID collision across distinct global courses
    return null;
  }

  if (qSlug && index.byCourseSlug.has(qSlug) && index.byCourseSlug.get(qSlug) === null) {
    // Ambiguous course slug collision across distinct global courses
    return null;
  }

  let matchByUdemyId: MembershipEntry | null = null;
  let matchBySlug: MembershipEntry | null = null;

  if (qUdemyId) {
    matchByUdemyId = index.byUdemyCourseId.get(qUdemyId) ?? null;
  }

  if (qSlug) {
    matchBySlug = index.byCourseSlug.get(qSlug) ?? null;
  }

  // If both queries provided:
  if (qUdemyId && qSlug) {
    if (!matchByUdemyId && !matchBySlug) {
      return null;
    }
    if (matchByUdemyId && matchBySlug) {
      if (matchByUdemyId.courseId !== matchBySlug.courseId) {
        // Conflict!
        return null;
      }
      return matchByUdemyId;
    }
    if (matchByUdemyId) {
      // Slug was provided but didn't match entry's slug if entry has one
      if (matchByUdemyId.courseSlug && matchByUdemyId.courseSlug !== qSlug) {
        return null;
      }
      return matchByUdemyId;
    }
    if (matchBySlug) {
      if (matchBySlug.udemyCourseId && matchBySlug.udemyCourseId !== qUdemyId) {
        return null;
      }
      return matchBySlug;
    }
  }

  // If only udemyCourseId provided
  if (qUdemyId) {
    return matchByUdemyId;
  }

  // If only slug provided
  if (qSlug) {
    return matchBySlug;
  }

  return null;
}
