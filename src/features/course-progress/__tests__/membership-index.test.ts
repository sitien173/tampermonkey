import { describe, it, expect } from 'vitest';
import {
  normalizeCoursePath,
  normalizeUdemyCourseId,
  buildMembershipIndex,
  matchMembership,
} from '../membership-index';
import { Folder } from '../../../state/types';

describe('membership-index', () => {
  describe('normalizeCoursePath', () => {
    it('normalizes full URLs and relative paths to canonical /course/{slug}', () => {
      expect(
        normalizeCoursePath('https://www.udemy.com/course/the-complete-web-development-bootcamp/learn/lecture/123#overview')
      ).toBe('/course/the-complete-web-development-bootcamp');

      expect(
        normalizeCoursePath('/course/react-deep-dive/learn/lecture/999?coupon=ABC#notes')
      ).toBe('/course/react-deep-dive');

      expect(
        normalizeCoursePath('https://ibmcsr.udemy.com/course/vue-complete/')
      ).toBe('/course/vue-complete');

      expect(
        normalizeCoursePath('/course/python-masterclass')
      ).toBe('/course/python-masterclass');
    });

    it('returns null for non-course URLs or invalid paths', () => {
      expect(normalizeCoursePath('/home/my-courses/learning/')).toBeNull();
      expect(normalizeCoursePath('https://www.udemy.com/user/logout/')).toBeNull();
      expect(normalizeCoursePath('')).toBeNull();
    });
  });

  describe('normalizeUdemyCourseId', () => {
    it('normalizes numeric and string identifiers', () => {
      expect(normalizeUdemyCourseId(12345)).toBe('12345');
      expect(normalizeUdemyCourseId(' 67890 ')).toBe('67890');
      expect(normalizeUdemyCourseId('')).toBeNull();
      expect(normalizeUdemyCourseId(null)).toBeNull();
      expect(normalizeUdemyCourseId(undefined)).toBeNull();
    });
  });

  describe('buildMembershipIndex and matchMembership', () => {
    const folders: Folder[] = [
      {
        id: 'folder-b',
        name: 'Folder B',
        color: '#222',
        sort_order: 2,
        course_count: 1,
        courses: [
          {
            id: 'guid-1',
            udemy_course_id: '1001',
            folder_id: 'folder-b',
            title: 'Web Bootcamp',
            url: 'https://www.udemy.com/course/web-bootcamp/',
            progress: 10,
            is_completed: false,
            added_at: 1,
          },
        ],
      },
      {
        id: 'folder-a',
        name: 'Folder A',
        color: '#111',
        sort_order: 1, // lowest sort order -> should be primary folder
        course_count: 2,
        courses: [
          {
            id: 'guid-1',
            udemy_course_id: '1001',
            folder_id: 'folder-a',
            title: 'Web Bootcamp',
            url: 'https://www.udemy.com/course/web-bootcamp/',
            progress: 10,
            is_completed: false,
            added_at: 1,
          },
          {
            id: 'guid-2',
            udemy_course_id: '1002',
            folder_id: 'folder-a',
            title: 'React Deep Dive',
            url: '/course/react-deep-dive/learn/lecture/1',
            progress: 50,
            is_completed: false,
            added_at: 2,
          },
        ],
      },
    ];

    it('builds membership index with primary folder determined by lowest sort order', () => {
      const index = buildMembershipIndex(folders);
      const entry = matchMembership(index, { courseSlug: 'web-bootcamp' });

      expect(entry).not.toBeNull();
      expect(entry?.courseId).toBe('guid-1');
      expect(entry?.primaryFolderId).toBe('folder-a'); // sort_order 1 vs sort_order 2
      expect(entry?.containingFolderIds).toEqual(['folder-a', 'folder-b']);
    });

    it('matches by courseSlug or learning path', () => {
      const index = buildMembershipIndex(folders);
      const entry = matchMembership(index, {
        locationPath: '/course/react-deep-dive/learn/lecture/555',
      });

      expect(entry).not.toBeNull();
      expect(entry?.courseId).toBe('guid-2');
      expect(entry?.primaryFolderId).toBe('folder-a');
    });

    it('matches by canonical udemyCourseId', () => {
      const index = buildMembershipIndex(folders);
      const entry = matchMembership(index, { udemyCourseId: 1002 });

      expect(entry).not.toBeNull();
      expect(entry?.courseId).toBe('guid-2');
    });

    it('suppresses match when both identifiers exist but conflict', () => {
      const index = buildMembershipIndex(folders);
      // udemyCourseId 1001 is Web Bootcamp, but slug is react-deep-dive
      const entry = matchMembership(index, {
        udemyCourseId: '1001',
        courseSlug: 'react-deep-dive',
      });

      expect(entry).toBeNull();
    });

    it('returns null when course has no membership in folders', () => {
      const index = buildMembershipIndex(folders);
      const entry = matchMembership(index, { courseSlug: 'unregistered-course' });
      expect(entry).toBeNull();
    });

    it('uses folder ID as tie breaker when sort_order is identical', () => {
      const tieFolders: Folder[] = [
        {
          id: 'folder-z',
          name: 'Z',
          color: '#000',
          sort_order: 1,
          course_count: 1,
          courses: [
            {
              id: 'guid-tie',
              udemy_course_id: '99',
              folder_id: 'folder-z',
              title: 'Tie Course',
              url: '/course/tie-course',
              added_at: 1,
            },
          ],
        },
        {
          id: 'folder-a',
          name: 'A',
          color: '#000',
          sort_order: 1,
          course_count: 1,
          courses: [
            {
              id: 'guid-tie',
              udemy_course_id: '99',
              folder_id: 'folder-a',
              title: 'Tie Course',
              url: '/course/tie-course',
              added_at: 1,
            },
          ],
        },
      ];

      const index = buildMembershipIndex(tieFolders);
      const entry = matchMembership(index, { courseSlug: 'tie-course' });
      expect(entry?.primaryFolderId).toBe('folder-a'); // 'folder-a' < 'folder-z'
    });

    it('suppresses match when two distinct global courses share a course slug', () => {
      const ambiguousSlugFolders: Folder[] = [
        {
          id: 'folder-1',
          name: 'Folder 1',
          color: '#111',
          sort_order: 1,
          course_count: 3,
          courses: [
            {
              id: 'guid-c1',
              udemy_course_id: '2001',
              folder_id: 'folder-1',
              title: 'Course 1',
              url: 'https://www.udemy.com/course/shared-slug/',
              added_at: 1,
            },
            {
              id: 'guid-c2',
              udemy_course_id: '2002',
              folder_id: 'folder-1',
              title: 'Course 2',
              url: 'https://www.udemy.com/course/shared-slug/',
              added_at: 2,
            },
            {
              id: 'guid-c3',
              udemy_course_id: '2003',
              folder_id: 'folder-1',
              title: 'Course 3',
              url: 'https://www.udemy.com/course/unique-slug/',
              added_at: 3,
            },
          ],
        },
      ];

      const index = buildMembershipIndex(ambiguousSlugFolders);

      // Shared slug between guid-c1 and guid-c2 -> returns null
      expect(matchMembership(index, { courseSlug: 'shared-slug' })).toBeNull();

      // Unique slug for guid-c3 -> returns match
      const uniqueMatch = matchMembership(index, { courseSlug: 'unique-slug' });
      expect(uniqueMatch).not.toBeNull();
      expect(uniqueMatch?.courseId).toBe('guid-c3');
    });

    it('suppresses match when two distinct global courses share a udemyCourseId', () => {
      const ambiguousIdFolders: Folder[] = [
        {
          id: 'folder-1',
          name: 'Folder 1',
          color: '#111',
          sort_order: 1,
          course_count: 2,
          courses: [
            {
              id: 'guid-d1',
              udemy_course_id: '9999',
              folder_id: 'folder-1',
              title: 'Course D1',
              url: 'https://www.udemy.com/course/slug-d1/',
              added_at: 1,
            },
            {
              id: 'guid-d2',
              udemy_course_id: '9999',
              folder_id: 'folder-1',
              title: 'Course D2',
              url: 'https://www.udemy.com/course/slug-d2/',
              added_at: 2,
            },
          ],
        },
      ];

      const index = buildMembershipIndex(ambiguousIdFolders);
      expect(matchMembership(index, { udemyCourseId: '9999' })).toBeNull();
    });
  });
});
