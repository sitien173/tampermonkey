import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../../../state/store';
import { useAddCourse } from '../useAddCourse';
import { addCourseToFolders, fetchSync } from '../../../lib/api';
import { getUdemyAccessToken } from '../../../lib/udemy-token';

vi.mock('../../../lib/api', () => ({
  addCourseToFolders: vi.fn(),
  fetchSync: vi.fn(),
}));

vi.mock('../../../lib/udemy-token', () => ({
  getUdemyAccessToken: vi.fn(),
}));

vi.mock('../../fab/useCourseContext', () => ({
  useCourseContext: vi.fn(() => ({
    id: 'course-123',
    title: 'Test Course',
    url: 'https://udemy.com/course/test',
  })),
}));

const AddCourseHarness: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { submit, status } = useAddCourse();

  return (
    <div>
      <div data-testid="revision">{state.licenseScopeRevision}</div>
      <div data-testid="status">{status}</div>
      <div data-testid="folder-count">{state.folders.folders.length}</div>
      <div data-testid="folder-names">{state.folders.folders.map((f) => f.name).join(',')}</div>
      <div data-testid="notice">{state.sync.notice?.text ?? ''}</div>
      <button
        data-testid="submit-btn"
        onClick={() => {
          submit('course-123', ['f1']);
        }}
      >
        Submit
      </button>
      <button
        data-testid="commit-key-b"
        onClick={() => {
          dispatch({ type: 'LICENSE_COMMIT', payload: { licenseKey: 'key-B' } });
        }}
      >
        Commit Key B
      </button>
    </div>
  );
};

describe('useAddCourse revision safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'GM_getValue',
      vi.fn(() => ({
        licenseKey: 'key-A',
        apiKey: 'api-key',
      }))
    );
    vi.stubGlobal('GM_setValue', vi.fn());
    vi.mocked(getUdemyAccessToken).mockReturnValue('mock-token');
    vi.mocked(addCourseToFolders).mockResolvedValue({
      ok: true,
      data: { added: 1 },
    });
  });

  it('ignores stale in-flight server refresh results after a LICENSE_COMMIT', async () => {
    let resolveFetchSync: (val: any) => void;
    const fetchSyncPromise = new Promise<any>((resolve) => {
      resolveFetchSync = resolve;
    });

    vi.mocked(fetchSync).mockReturnValueOnce(fetchSyncPromise);

    render(
      <AppStateProvider>
        <AddCourseHarness />
      </AppStateProvider>
    );

    // Initial state revision 0
    expect(screen.getByTestId('revision').textContent).toBe('0');

    // Start submit at revision 0
    fireEvent.click(screen.getByTestId('submit-btn'));

    expect(addCourseToFolders).toHaveBeenCalledTimes(1);

    // Commit a new license key (increments revision to 1 and resets folders)
    fireEvent.click(screen.getByTestId('commit-key-b'));

    await waitFor(() => {
      expect(screen.getByTestId('revision').textContent).toBe('1');
    });

    // Resolve the in-flight fetchSync from the revision 0 submit
    resolveFetchSync!({
      ok: true,
      data: {
        folders: [
          {
            id: 'stale-folder-1',
            name: 'Stale Folder From Key A',
            color: '#000',
            sort_order: 0,
            courses: [],
            course_count: 0,
          },
        ],
      },
    });

    // Wait for submit async completion
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('idle');
    });

    // Verify stale folder and stale notice were rejected by the reducer
    expect(screen.getByTestId('folder-count').textContent).toBe('0');
    expect(screen.getByTestId('folder-names').textContent).toBe('');
    expect(screen.getByTestId('notice').textContent).toBe('');
  });
});
