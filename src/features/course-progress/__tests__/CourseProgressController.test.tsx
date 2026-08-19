import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppStateProvider, useAppState } from '../../../state/store';
import { CourseProgressController } from '../CourseProgressController';
import * as api from '../../../lib/api';

vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/api')>('../../../lib/api');
  return {
    ...actual,
    updateCourseProgress: vi.fn(),
    fetchSync: vi.fn(),
  };
});

const StateViewer: React.FC = () => {
  const { state } = useAppState();
  const folder = state.folders.folders[0];
  const course = folder?.courses[0];
  return (
    <div>
      <div data-testid="course-progress">{course?.progress ?? ''}</div>
      <div data-testid="course-lesson">{course?.last_lesson_url ?? ''}</div>
      <div data-testid="notice">{state.sync.notice?.text ?? ''}</div>
    </div>
  );
};

describe('CourseProgressController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/course/bootcamp/learn/lecture/100');

    vi.stubGlobal(
      'GM_getValue',
      vi.fn(() => ({
        licenseKey: 'test-license-key',
        apiKey: 'test-api-key',
      }))
    );
    vi.stubGlobal('GM_setValue', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('observes DOM, matches membership, and syncs progress to API', async () => {
    vi.mocked(api.updateCourseProgress).mockResolvedValue({
      ok: true,
      data: { success: true },
      status: 200,
    });

    const Harness: React.FC = () => {
      const { dispatch } = useAppState();

      React.useEffect(() => {
        dispatch({
          type: 'FOLDERS_UPDATE',
          payload: {
            status: 'ready',
            folders: [
              {
                id: 'folder-primary',
                name: 'Web Dev',
                color: '#123',
                sort_order: 1,
                course_count: 1,
                courses: [
                  {
                    id: 'course-guid-bootcamp',
                    udemy_course_id: '1001',
                    folder_id: 'folder-primary',
                    title: 'Web Bootcamp',
                    url: 'https://www.udemy.com/course/bootcamp/',
                    progress: 0,
                    is_completed: false,
                    last_lesson_url: null,
                    added_at: 1,
                  },
                ],
              },
            ],
          },
          revision: 0,
        });
      }, [dispatch]);

      return (
        <div>
          <CourseProgressController />
          <StateViewer />
        </div>
      );
    };

    // Setup DOM with course and section aggregates
    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '58 of 386 complete.';
    document.body.appendChild(counter);

    const section = document.createElement('span');
    section.setAttribute('data-purpose', 'section-duration-sr-only');
    section.textContent = '58 of 386 lectures completed';
    document.body.appendChild(section);

    render(
      <AppStateProvider>
        <Harness />
      </AppStateProvider>
    );

    // Advance trailing delay and allow microtasks / re-render to flush
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(api.updateCourseProgress).toHaveBeenCalledTimes(1);
    expect(api.updateCourseProgress).toHaveBeenCalledWith(
      expect.objectContaining({ licenseKey: 'test-license-key' }),
      'folder-primary',
      'course-guid-bootcamp',
      {
        progress: 15,
        is_completed: false,
        last_lesson_url: '/course/bootcamp/learn/lecture/100',
      }
    );

    // Course in state is updated
    expect(screen.getByTestId('course-progress').textContent).toBe('15');
    expect(screen.getByTestId('course-lesson').textContent).toBe('/course/bootcamp/learn/lecture/100');
  });

  it('pauses tracking and shows error notice on 401 or 403 response', async () => {
    vi.mocked(api.updateCourseProgress).mockResolvedValue({
      ok: false,
      error: 'HTTP Error 401: Unauthorized',
      status: 401,
    });

    const Harness: React.FC = () => {
      const { dispatch } = useAppState();

      React.useEffect(() => {
        dispatch({
          type: 'FOLDERS_UPDATE',
          payload: {
            status: 'ready',
            folders: [
              {
                id: 'folder-1',
                name: 'Web Dev',
                color: '#123',
                sort_order: 1,
                course_count: 1,
                courses: [
                  {
                    id: 'course-1',
                    udemy_course_id: '1001',
                    folder_id: 'folder-1',
                    title: 'Web Bootcamp',
                    url: '/course/bootcamp',
                    progress: 0,
                    is_completed: false,
                    last_lesson_url: null,
                    added_at: 1,
                  },
                ],
              },
            ],
          },
          revision: 0,
        });
      }, [dispatch]);

      return (
        <div>
          <CourseProgressController />
          <StateViewer />
        </div>
      );
    };

    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '58 of 386 complete.';
    document.body.appendChild(counter);

    const section = document.createElement('span');
    section.setAttribute('data-purpose', 'section-duration-sr-only');
    section.textContent = '58 of 386 lectures completed';
    document.body.appendChild(section);

    render(
      <AppStateProvider>
        <Harness />
      </AppStateProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(api.updateCourseProgress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('notice').textContent).toContain('Course progress tracking paused');
  });

  it('refreshes sync and rematches on 404 response', async () => {
    vi.mocked(api.updateCourseProgress)
      .mockResolvedValueOnce({
        ok: false,
        error: 'HTTP Error 404: Not Found',
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { success: true },
        status: 200,
      });

    vi.mocked(api.fetchSync).mockResolvedValue({
      ok: true,
      data: {
        folders: [
          {
            id: 'folder-new',
            name: 'New Folder',
            color: '#999',
            sort_order: 1,
            course_count: 1,
            courses: [
              {
                id: 'course-1',
                udemy_course_id: '1001',
                folder_id: 'folder-new',
                title: 'Web Bootcamp',
                url: '/course/bootcamp',
                progress: 0,
                is_completed: false,
                last_lesson_url: null,
                added_at: 1,
              },
            ],
          },
        ],
      },
      status: 200,
    });

    const Harness: React.FC = () => {
      const { dispatch } = useAppState();

      React.useEffect(() => {
        dispatch({
          type: 'FOLDERS_UPDATE',
          payload: {
            status: 'ready',
            folders: [
              {
                id: 'folder-old',
                name: 'Old Folder',
                color: '#123',
                sort_order: 1,
                course_count: 1,
                courses: [
                  {
                    id: 'course-1',
                    udemy_course_id: '1001',
                    folder_id: 'folder-old',
                    title: 'Web Bootcamp',
                    url: '/course/bootcamp',
                    progress: 0,
                    is_completed: false,
                    last_lesson_url: null,
                    added_at: 1,
                  },
                ],
              },
            ],
          },
          revision: 0,
        });
      }, [dispatch]);

      return (
        <div>
          <CourseProgressController />
          <StateViewer />
        </div>
      );
    };

    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '58 of 386 complete.';
    document.body.appendChild(counter);

    const section = document.createElement('span');
    section.setAttribute('data-purpose', 'section-duration-sr-only');
    section.textContent = '58 of 386 lectures completed';
    document.body.appendChild(section);

    render(
      <AppStateProvider>
        <Harness />
      </AppStateProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(api.fetchSync).toHaveBeenCalledTimes(1);
    expect(api.updateCourseProgress).toHaveBeenCalledTimes(2);
    expect(api.updateCourseProgress).toHaveBeenLastCalledWith(
      expect.anything(),
      'folder-new',
      'course-1',
      expect.anything()
    );
  });

  it('reconciles store with confirmed server course progress when present in response', async () => {
    vi.mocked(api.updateCourseProgress).mockResolvedValue({
      ok: true,
      data: {
        success: true,
        course: {
          id: 'course-guid-bootcamp',
          udemy_course_id: '1001',
          folder_id: 'folder-primary',
          title: 'Web Bootcamp',
          url: 'https://www.udemy.com/course/bootcamp/',
          progress: 20, // server confirmed value differs from submitted 15
          is_completed: 1 as any, // 0/1 integer from wire normalized to boolean
          last_lesson_url: '/course/bootcamp/learn/lecture/200',
          added_at: 1,
        },
      },
      status: 200,
    });

    const Harness: React.FC = () => {
      const { dispatch } = useAppState();

      React.useEffect(() => {
        dispatch({
          type: 'FOLDERS_UPDATE',
          payload: {
            status: 'ready',
            folders: [
              {
                id: 'folder-primary',
                name: 'Web Dev',
                color: '#123',
                sort_order: 1,
                course_count: 1,
                courses: [
                  {
                    id: 'course-guid-bootcamp',
                    udemy_course_id: '1001',
                    folder_id: 'folder-primary',
                    title: 'Web Bootcamp',
                    url: 'https://www.udemy.com/course/bootcamp/',
                    progress: 0,
                    is_completed: false,
                    last_lesson_url: null,
                    added_at: 1,
                  },
                ],
              },
            ],
          },
          revision: 0,
        });
      }, [dispatch]);

      return (
        <div>
          <CourseProgressController />
          <StateViewer />
        </div>
      );
    };

    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '58 of 386 complete.';
    document.body.appendChild(counter);

    const section = document.createElement('span');
    section.setAttribute('data-purpose', 'section-duration-sr-only');
    section.textContent = '58 of 386 lectures completed';
    document.body.appendChild(section);

    render(
      <AppStateProvider>
        <Harness />
      </AppStateProvider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(api.updateCourseProgress).toHaveBeenCalledTimes(1);
    // Verified confirmed values from response.course are applied
    expect(screen.getByTestId('course-progress').textContent).toBe('20');
    expect(screen.getByTestId('course-lesson').textContent).toBe('/course/bootcamp/learn/lecture/200');
  });

  it('rejects stale 404 rematch if license revision changes while fetchSync is in flight', async () => {
    vi.mocked(api.updateCourseProgress).mockResolvedValueOnce({
      ok: false,
      error: 'HTTP Error 404: Not Found',
      status: 404,
    });

    let resolveSync: (val: any) => void;
    const syncPromise = new Promise((resolve) => {
      resolveSync = resolve;
    });
    vi.mocked(api.fetchSync).mockReturnValue(syncPromise as any);

    let capturedDispatch: any;
    const Harness: React.FC = () => {
      const { dispatch } = useAppState();
      capturedDispatch = dispatch;

      React.useEffect(() => {
        dispatch({
          type: 'FOLDERS_UPDATE',
          payload: {
            status: 'ready',
            folders: [
              {
                id: 'folder-old',
                name: 'Old Folder',
                color: '#123',
                sort_order: 1,
                course_count: 1,
                courses: [
                  {
                    id: 'course-1',
                    udemy_course_id: '1001',
                    folder_id: 'folder-old',
                    title: 'Web Bootcamp',
                    url: '/course/bootcamp',
                    progress: 0,
                    is_completed: false,
                    last_lesson_url: null,
                    added_at: 1,
                  },
                ],
              },
            ],
          },
          revision: 0,
        });
      }, [dispatch]);

      return (
        <div>
          <CourseProgressController />
          <StateViewer />
        </div>
      );
    };

    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '58 of 386 complete.';
    document.body.appendChild(counter);

    const section = document.createElement('span');
    section.setAttribute('data-purpose', 'section-duration-sr-only');
    section.textContent = '58 of 386 lectures completed';
    document.body.appendChild(section);

    render(
      <AppStateProvider>
        <Harness />
      </AppStateProvider>
    );

    // Advance to trigger transport and receive 404 -> triggers fetchSync
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(api.fetchSync).toHaveBeenCalledTimes(1);

    // Change license key / commit revision before fetchSync completes
    await act(async () => {
      capturedDispatch({
        type: 'LICENSE_COMMIT',
        payload: { licenseKey: 'new-license-key' },
      });
    });

    // Now resolve old fetchSync
    await act(async () => {
      resolveSync!({
        ok: true,
        data: {
          folders: [
            {
              id: 'folder-stale-sync',
              name: 'Stale Folder',
              color: '#000',
              sort_order: 0,
              course_count: 1,
              courses: [],
            },
          ],
        },
        status: 200,
      });
      await vi.advanceTimersByTimeAsync(100);
    });

    // Stale folders should NOT have overwritten the new revision folders (which were reset to empty)
    expect(screen.getByTestId('course-progress').textContent).toBe('');
  });
});
