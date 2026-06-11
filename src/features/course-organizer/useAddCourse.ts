import { useState } from 'react';
import { useAppState } from '../../state/store';
import { getUdemyAccessToken } from '../../lib/udemy-token';
import { addCourseToFolders, fetchSync } from '../../lib/api';
import { getCourseSaveErrorMessage } from './errors';
import { generateUUID } from '../../lib/uuid';
import { useCourseContext } from '../fab/useCourseContext';

export function useAddCourse() {
  const { state, dispatch } = useAppState();
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');
  const courseInfo = useCourseContext();

  const submit = async (
    courseId: string | number,
    folderIds: string[]
  ): Promise<{ ok: true; added: number } | { ok: false; message: string }> => {
    setStatus('saving');
    try {
      if (!state.config.licenseKey) {
        // Local mode
        let added = 0;
        const now = Math.floor(Date.now() / 1000);
        const updatedFolders = state.folders.folders.map((f) => {
          if (folderIds.includes(f.id)) {
            const courses = f.courses || [];
            const exists = courses.some(
              (c) =>
                c.udemy_course_id === String(courseId) || c.id === String(courseId)
            );
            if (!exists) {
              const courseEntry = {
                id: generateUUID(),
                udemy_course_id: String(courseId),
                folder_id: f.id,
                title: courseInfo?.title || 'Unknown Course',
                url: courseInfo?.url || window.location.href,
                image_url: courseInfo?.image,
                instructor: courseInfo?.instructor,
                added_at: now,
              };
              added++;
              return {
                ...f,
                courses: [...courses, courseEntry],
                course_count: courses.length + 1,
              };
            }
          } else {
            // Remove course from folder if not selected anymore
            const courses = f.courses || [];
            const exists = courses.some(
              (c) =>
                c.udemy_course_id === String(courseId) || c.id === String(courseId)
            );
            if (exists) {
              const filteredCourses = courses.filter(
                (c) =>
                  c.udemy_course_id !== String(courseId) && c.id !== String(courseId)
              );
              return {
                ...f,
                courses: filteredCourses,
                course_count: filteredCourses.length,
              };
            }
          }
          return f;
        });

        dispatch({ type: 'FOLDERS_UPDATE', payload: { folders: updatedFolders } });
        dispatch({
          type: 'NOTICE_PUSH',
          payload: {
            kind: 'success',
            text: `Saved to ${folderIds.length} folder${folderIds.length === 1 ? '' : 's'}`,
            ttl: 4000,
          },
        });
        setStatus('idle');
        return { ok: true, added };
      }

      const token = getUdemyAccessToken();
      if (!token) {
        const errorMsg = getCourseSaveErrorMessage(
          new Error('Udemy access token not found. Refresh/login to Udemy and try again.')
        );
        setStatus('idle');
        return { ok: false, message: errorMsg };
      }

      const result = await addCourseToFolders(
        state.config,
        { course_id: courseId, folder_ids: folderIds },
        token
      );

      if (!result.ok) {
        const errorMsg = getCourseSaveErrorMessage(result.error);
        setStatus('idle');
        return { ok: false, message: errorMsg };
      }

      // Success: refresh folders from server to update client state
      const res = await fetchSync(state.config);
      if (res.ok) {
        dispatch({
          type: 'FOLDERS_UPDATE',
          payload: { status: 'ready', folders: res.data.folders },
        });
      }

      dispatch({
        type: 'NOTICE_PUSH',
        payload: {
          kind: 'success',
          text: `Saved to ${folderIds.length} folder${folderIds.length === 1 ? '' : 's'}`,
          ttl: 4000,
        },
      });

      setStatus('idle');
      return { ok: true, added: result.data.added };
    } catch (error: any) {
      const errorMsg = getCourseSaveErrorMessage(error);
      setStatus('idle');
      return { ok: false, message: errorMsg };
    }
  };

  return { submit, status };
}
