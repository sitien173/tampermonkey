import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../../../state/store';
import { useFolders } from '../useFolders';
import { fetchSync, createFolder as apiCreateFolder } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({
  fetchSync: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

const FoldersInspector: React.FC = () => {
  const { folders, status, createFolder } = useFolders();
  const { state } = useAppState();

  return (
    <div>
      <div data-testid="folders-status">{status}</div>
      <div data-testid="folders-count">{folders.length}</div>
      <div data-testid="license-revision">{state.licenseScopeRevision}</div>
      <div data-testid="folder-names">{folders.map((f) => f.name).join(',')}</div>
      <button
        data-testid="create-local-btn"
        onClick={() => createFolder('Local Folder', '#123456')}
      >
        Create Local
      </button>
    </div>
  );
};

describe('useFolders', () => {
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

  it('produces empty folder state and does not generate default folders for empty license key', async () => {
    render(
      <AppStateProvider>
        <FoldersInspector />
      </AppStateProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('folders-status').textContent).toBe('ready');
    });

    expect(screen.getByTestId('folders-count').textContent).toBe('0');
    expect(screen.getByTestId('folder-names').textContent).toBe('');
    expect(fetchSync).not.toHaveBeenCalled();
  });

  it('fetches server folders and populates state when licenseKey is present', async () => {
    vi.stubGlobal(
      'GM_getValue',
      vi.fn(() => ({
        licenseKey: 'test-license',
        apiKey: 'api-key',
      }))
    );

    vi.mocked(fetchSync).mockResolvedValueOnce({
      ok: true,
      data: {
        folders: [
          {
            id: 'server-f1',
            name: 'Web Dev',
            color: '#ff0000',
            sort_order: 0,
            courses: [],
            course_count: 0,
          },
        ],
      },
    });

    render(
      <AppStateProvider>
        <FoldersInspector />
      </AppStateProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('folders-status').textContent).toBe('ready');
    });

    expect(screen.getByTestId('folders-count').textContent).toBe('1');
    expect(screen.getByTestId('folder-names').textContent).toBe('Web Dev');
    expect(fetchSync).toHaveBeenCalledTimes(1);
  });

  it('ignores stale fetchSync results when revision increments in flight', async () => {
    let resolveFirstFetch: (val: any) => void;
    const firstFetchPromise = new Promise<any>((resolve) => {
      resolveFirstFetch = resolve;
    });

    vi.stubGlobal(
      'GM_getValue',
      vi.fn(() => ({
        licenseKey: 'key-A',
        apiKey: 'api-key',
      }))
    );

    vi.mocked(fetchSync)
      .mockReturnValueOnce(firstFetchPromise)
      .mockResolvedValueOnce({
        ok: true,
        data: {
          folders: [
            { id: 'f-B', name: 'Folder B', color: '#222', sort_order: 0, courses: [], course_count: 0 },
          ],
        },
      });

    const HarnessWithCommit: React.FC = () => {
      const { dispatch } = useAppState();
      return (
        <div>
          <FoldersInspector />
          <button
            data-testid="commit-btn"
            onClick={() => {
              dispatch({ type: 'LICENSE_COMMIT', payload: { licenseKey: 'key-B' } });
            }}
          >
            Commit
          </button>
        </div>
      );
    };

    render(
      <AppStateProvider>
        <HarnessWithCommit />
      </AppStateProvider>
    );

    // First fetch is in flight for key-A
    expect(fetchSync).toHaveBeenCalledTimes(1);

    // Commit key-B (increments revision to 1)
    screen.getByTestId('commit-btn').click();

    await waitFor(() => {
      expect(screen.getByTestId('license-revision').textContent).toBe('1');
    });

    // Resolve first fetch (revision 0)
    resolveFirstFetch!({
      ok: true,
      data: {
        folders: [
          { id: 'f-A', name: 'Folder A (Stale)', color: '#111', sort_order: 0, courses: [], course_count: 0 },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('folder-names').textContent).toBe('Folder B');
    });

    expect(screen.getByTestId('folder-names').textContent).not.toContain('Folder A (Stale)');
  });
});
