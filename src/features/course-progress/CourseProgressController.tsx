import React, { useEffect, useRef, useMemo } from 'react';
import { useAppState } from '../../state/store';
import { updateCourseProgress, fetchSync } from '../../lib/api';
import { observeUdemyProgress } from './observeUdemyProgress';
import { buildMembershipIndex, matchMembership } from './membership-index';
import { CourseProgressUpdateQueue } from './update-queue';
import { CourseProgressSnapshot } from './udemy-progress';

export const CourseProgressController: React.FC = () => {
  const { state, dispatch } = useAppState();
  const licenseKey = state.config.licenseKey;
  const revision = state.licenseScopeRevision;
  const folders = state.folders.folders;

  const membershipIndex = useMemo(() => buildMembershipIndex(folders), [folders]);
  const indexRef = useRef(membershipIndex);
  indexRef.current = membershipIndex;

  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  const configRef = useRef(state.config);
  configRef.current = state.config;

  const isPausedRef = useRef(false);

  // Reset pause state when revision changes
  useEffect(() => {
    isPausedRef.current = false;
  }, [revision]);

  const queueRef = useRef<CourseProgressUpdateQueue | null>(null);

  if (!queueRef.current) {
    queueRef.current = new CourseProgressUpdateQueue({
      transport: async ({ folderId, courseId, payload }) => {
        return updateCourseProgress(configRef.current, folderId, courseId, payload);
      },
      onSuccess: ({ courseId, payload, response, revision: reqRev }) => {
        let confirmedProgress = payload.progress;
        let confirmedIsCompleted = payload.is_completed;
        let confirmedLastLessonUrl = payload.last_lesson_url;

        if (response?.course) {
          const c = response.course as any;
          if (typeof c.progress === 'number') {
            confirmedProgress = c.progress;
          } else if (c.progress !== undefined && c.progress !== null) {
            confirmedProgress = parseInt(String(c.progress), 10) || 0;
          }
          if (c.is_completed !== undefined) {
            confirmedIsCompleted = Boolean(c.is_completed);
          }
          if (c.last_lesson_url !== undefined) {
            confirmedLastLessonUrl = c.last_lesson_url ?? null;
          }
        }

        dispatch({
          type: 'COURSE_PROGRESS_UPDATE',
          payload: {
            courseId,
            progress: confirmedProgress,
            is_completed: confirmedIsCompleted,
            last_lesson_url: confirmedLastLessonUrl,
          },
          revision: reqRev,
        });
      },
      onAuthError: ({ revision: reqRev }) => {
        isPausedRef.current = true;
        dispatch({
          type: 'NOTICE_PUSH',
          payload: {
            kind: 'error',
            text: 'Course progress tracking paused: authentication required.',
            ttl: 8000,
          },
          revision: reqRev,
        });
      },
      onRematch404: async ({ courseId, revision: reqRev }) => {
        if (revisionRef.current !== reqRev) {
          return null;
        }
        const syncResult = await fetchSync(configRef.current);
        if (revisionRef.current !== reqRev) {
          return null;
        }
        if (syncResult.ok) {
          dispatch({
            type: 'FOLDERS_UPDATE',
            payload: { folders: syncResult.data.folders },
            revision: reqRev,
          });
          const newIndex = buildMembershipIndex(syncResult.data.folders);
          const entry = newIndex.byCourseId.get(courseId);
          return entry ? entry.primaryFolderId : null;
        }
        return null;
      },
    });
  }

  // When license or revision changes, reset queue
  useEffect(() => {
    queueRef.current?.reset();
  }, [licenseKey, revision]);

  useEffect(() => {
    if (!licenseKey) {
      return;
    }

    const cleanupObserver = observeUdemyProgress({
      onProgress: (snapshot: CourseProgressSnapshot) => {
        if (isPausedRef.current) return;
        if (!licenseKey) return;

        const match = matchMembership(indexRef.current, {
          courseSlug: snapshot.courseSlug,
          locationPath: snapshot.lastLessonUrl,
        });

        if (!match) {
          // Missing membership or conflicting identifiers: ignore
          return;
        }

        queueRef.current?.enqueue({
          folderId: match.primaryFolderId,
          courseId: match.courseId,
          payload: {
            progress: snapshot.progress,
            is_completed: snapshot.isCompleted,
            last_lesson_url: snapshot.lastLessonUrl,
          },
          revision: revisionRef.current,
        });
      },
    });

    return () => {
      cleanupObserver();
    };
  }, [licenseKey, revision, folders]);

  return null;
};
