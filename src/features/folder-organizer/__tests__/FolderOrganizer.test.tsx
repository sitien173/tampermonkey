import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../../../state/store';
import { FolderOrganizer } from '../FolderOrganizer';
import { fetchSync } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({
  fetchSync: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

const HarnessWithControls: React.FC = () => {
  const { state, dispatch } = useAppState();
  return (
    <div>
      <div data-testid="organizer-open">{state.ui.organizerOpen.toString()}</div>
      <div data-testid="revision">{state.licenseScopeRevision}</div>
      <button
        data-testid="commit-key-b"
        onClick={() => {
          dispatch({ type: 'LICENSE_COMMIT', payload: { licenseKey: 'key-B' } });
        }}
      >
        Commit Key B
      </button>
      <FolderOrganizer />
    </div>
  );
};

describe('FolderOrganizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'GM_getValue',
      vi.fn(() => ({
        licenseKey: '',
        apiKey: 'api-key',
      }))
    );
    vi.stubGlobal('GM_setValue', vi.fn());
  });

  it('renders loading state when folders are syncing', () => {
    const LoadingHarness: React.FC = () => {
      const { dispatch } = useAppState();
      React.useEffect(() => {
        dispatch({ type: 'FOLDERS_UPDATE', payload: { status: 'loading' } });
      }, [dispatch]);
      return <FolderOrganizer />;
    };

    render(
      <AppStateProvider>
        <LoadingHarness />
      </AppStateProvider>
    );

    expect(screen.getByText('Syncing folders from server...')).toBeDefined();
  });

  it('renders error state and retry button when status is error', () => {
    const ErrorHarness: React.FC = () => {
      const { dispatch } = useAppState();
      React.useEffect(() => {
        dispatch({ type: 'FOLDERS_UPDATE', payload: { status: 'error' } });
      }, [dispatch]);
      return <FolderOrganizer />;
    };

    render(
      <AppStateProvider>
        <ErrorHarness />
      </AppStateProvider>
    );

    expect(screen.getByText('Failed to load folders from server.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });

  it('renders empty state when license has no folders', async () => {
    render(
      <AppStateProvider>
        <FolderOrganizer />
      </AppStateProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Select a folder to view courses.')).toBeDefined();
    });

    expect(screen.queryByText('My Courses')).toBeNull();
    expect(screen.queryByText('Favorites')).toBeNull();
  });

  it('resets local selection and editing state across revision changes', async () => {
    vi.stubGlobal(
      'GM_getValue',
      vi.fn(() => ({
        licenseKey: 'key-A',
        apiKey: 'api-key',
      }))
    );

    vi.mocked(fetchSync)
      .mockResolvedValueOnce({
        ok: true,
        data: {
          folders: [
            {
              id: 'f-1',
              name: 'Folder 1',
              color: '#111',
              sort_order: 0,
              courses: [
                {
                  id: 'c-1',
                  udemy_course_id: '100',
                  folder_id: 'f-1',
                  title: 'Course 1',
                  url: '/course/1',
                  added_at: 100,
                },
              ],
              course_count: 1,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          folders: [
            {
              id: 'f-2',
              name: 'Folder 2',
              color: '#222',
              sort_order: 0,
              courses: [],
              course_count: 0,
            },
          ],
        },
      });

    render(
      <AppStateProvider>
        <HarnessWithControls />
      </AppStateProvider>
    );

    // Initial load for key-A
    await waitFor(() => {
      expect(screen.getAllByText('Folder 1').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Course 1')).toBeDefined();

    // Start renaming Folder 1
    const renameBtn = screen.getByTitle('Rename Folder');
    fireEvent.click(renameBtn);
    expect(screen.getByDisplayValue('Folder 1')).toBeDefined();

    // Commit key B (revision 1)
    fireEvent.click(screen.getByTestId('commit-key-b'));

    // Loading appears and editing form is reset
    await waitFor(() => {
      expect(screen.getAllByText('Folder 2').length).toBeGreaterThan(0);
    });

    // Folder 1 and its editing input must no longer exist
    expect(screen.queryByText('Folder 1')).toBeNull();
    expect(screen.queryByDisplayValue('Folder 1')).toBeNull();
    expect(screen.getAllByText('Folder 2').length).toBeGreaterThan(0);
  });

  it('closes organizer on close button click', () => {
    render(
      <AppStateProvider>
        <HarnessWithControls />
      </AppStateProvider>
    );

    const closeBtn = screen.getByRole('button', { name: 'Close organizer' });
    fireEvent.click(closeBtn);

    expect(screen.getByTestId('organizer-open').textContent).toBe('false');
  });

  describe('Course Progress Rendering', () => {
    const ProgressHarness: React.FC = () => {
      const { dispatch } = useAppState();

      React.useEffect(() => {
        dispatch({
          type: 'FOLDERS_UPDATE',
          payload: {
            status: 'ready',
            folders: [
              {
                id: 'folder-1',
                name: 'Progress Folder',
                color: '#111',
                sort_order: 0,
                course_count: 3,
                courses: [
                  {
                    id: 'c-zero',
                    udemy_course_id: '100',
                    folder_id: 'folder-1',
                    title: 'Zero Progress Course',
                    url: 'https://www.udemy.com/course/zero/',
                    progress: 0,
                    is_completed: false,
                    last_lesson_url: null,
                    added_at: 1,
                  },
                  {
                    id: 'c-in-progress',
                    udemy_course_id: '101',
                    folder_id: 'folder-1',
                    title: 'In Progress Course',
                    url: 'https://www.udemy.com/course/in-progress/',
                    progress: 45,
                    is_completed: false,
                    last_lesson_url: '/course/in-progress/learn/lecture/99',
                    added_at: 2,
                  },
                  {
                    id: 'c-completed',
                    udemy_course_id: '102',
                    folder_id: 'folder-1',
                    title: 'Completed Course',
                    url: 'https://www.udemy.com/course/completed/',
                    progress: 100,
                    is_completed: true,
                    last_lesson_url: '/course/completed/learn/lecture/500',
                    added_at: 3,
                  },
                  {
                    id: 'c-unsafe',
                    udemy_course_id: '103',
                    folder_id: 'folder-1',
                    title: 'Unsafe Link Course',
                    url: 'javascript:alert(1)',
                    progress: 10,
                    is_completed: false,
                    last_lesson_url: 'javascript:void(0)',
                    added_at: 4,
                  },
                ],
              },
            ],
          },
          revision: 0,
        });
      }, [dispatch]);

      return <FolderOrganizer />;
    };

    it('renders progress labels including integer 0% without treating 0 as missing', () => {
      render(
        <AppStateProvider>
          <ProgressHarness />
        </AppStateProvider>
      );

      expect(screen.getByText('0%')).toBeDefined();
      expect(screen.getByText('45%')).toBeDefined();
      expect(screen.getByText('100%')).toBeDefined();
    });

    it('renders accessible progressbar with ARIA attributes and labels', () => {
      render(
        <AppStateProvider>
          <ProgressHarness />
        </AppStateProvider>
      );

      const progressBars = screen.getAllByRole('progressbar');
      expect(progressBars).toHaveLength(4);

      expect(progressBars[0].getAttribute('aria-valuenow')).toBe('0');
      expect(progressBars[0].getAttribute('aria-label')).toBe('Progress for Zero Progress Course: 0%');

      expect(progressBars[1].getAttribute('aria-valuenow')).toBe('45');
      expect(progressBars[1].getAttribute('aria-label')).toBe('Progress for In Progress Course: 45%');

      expect(progressBars[2].getAttribute('aria-valuenow')).toBe('100');
      expect(progressBars[2].getAttribute('aria-label')).toBe('Progress for Completed Course: 100%');
    });

    it('renders completed badge and is-completed class for completed courses', () => {
      render(
        <AppStateProvider>
          <ProgressHarness />
        </AppStateProvider>
      );

      expect(screen.getByText('Completed')).toBeDefined();
      const completedLink = screen.getByRole('link', { name: /Completed Course/ });
      expect(completedLink.className).toContain('is-completed');
    });

    it('prefers last_lesson_url as primary resume link with fallback to course url', () => {
      render(
        <AppStateProvider>
          <ProgressHarness />
        </AppStateProvider>
      );

      // In Progress Course has last_lesson_url -> resolved against origin
      const inProgressLink = screen.getByRole('link', { name: /In Progress Course/ });
      expect(inProgressLink.getAttribute('href')).toBe('http://localhost:3000/course/in-progress/learn/lecture/99');

      // Zero Progress Course has no last_lesson_url -> falls back to url
      const zeroLink = screen.getByRole('link', { name: /Zero Progress Course/ });
      expect(zeroLink.getAttribute('href')).toBe('https://www.udemy.com/course/zero/');
    });

    it('renders non-clickable card for unsafe URLs', () => {
      render(
        <AppStateProvider>
          <ProgressHarness />
        </AppStateProvider>
      );

      // Unsafe Link Course should not be an <a> element
      expect(screen.queryByRole('link', { name: /Unsafe Link Course/ })).toBeNull();
      expect(screen.getByText('Unsafe Link Course')).toBeDefined();
    });
  });
});
