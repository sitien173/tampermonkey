import { describe, it, expect } from 'vitest';
import { appReducer } from '../store';
import { AppState, Action } from '../types';

describe('state reducer', () => {
  const initialState: AppState = {
    licenseScopeRevision: 0,
    config: {
      licenseKey: '',
      apiKey: '',
    },
    license: {
      key: '',
      status: 'unknown',
      expiresAt: null,
      lastValidatedAt: null,
    },
    sync: {
      phase: 'idle',
      lastResult: null,
      error: null,
      notice: null,
    },
    folders: {
      status: 'idle',
      folders: [],
    },
    ui: {
      settingsOpen: false,
      organizerOpen: false,
      fabOpen: false,
      addToFolderOpen: false,
    },
  };

  it('should push notice on NOTICE_PUSH', () => {
    const action: Action = {
      type: 'NOTICE_PUSH',
      payload: {
        kind: 'success',
        text: 'Test message',
        ttl: 3000,
      },
    };
    const newState = appReducer(initialState, action);
    expect(newState.sync.notice).toEqual({
      kind: 'success',
      text: 'Test message',
      ttl: 3000,
    });
  });

  it('should clear notice on NOTICE_CLEAR', () => {
    const stateWithNotice: AppState = {
      ...initialState,
      sync: {
        ...initialState.sync,
        notice: {
          kind: 'info',
          text: 'Temporary',
        },
      },
    };
    const action: Action = { type: 'NOTICE_CLEAR' };
    const newState = appReducer(stateWithNotice, action);
    expect(newState.sync.notice).toBeNull();
  });

  it('atomically resets license-scoped state and increments revision on LICENSE_COMMIT', () => {
    const populatedState: AppState = {
      licenseScopeRevision: 1,
      config: {
        licenseKey: 'old-license-key',
        apiKey: 'fixed-api-key',
      },
      license: {
        key: 'old-license-key',
        status: 'valid',
        expiresAt: 1700000000,
        lastValidatedAt: 1699999000,
      },
      sync: {
        phase: 'ok',
        lastResult: 'Synchronized 5 cookies',
        error: 'Prior error',
        notice: { kind: 'info', text: 'Old notice' },
      },
      folders: {
        status: 'ready',
        folders: [
          {
            id: 'folder-1',
            name: 'Old Folder',
            color: '#123456',
            sort_order: 0,
            courses: [
              {
                id: 'course-1',
                udemy_course_id: '123',
                folder_id: 'folder-1',
                title: 'Course 1',
                url: '/course/1',
                added_at: 1000,
                progress: 50,
                is_completed: false,
              },
            ],
            course_count: 1,
          },
        ],
      },
      ui: {
        settingsOpen: true,
        organizerOpen: true,
        fabOpen: true,
        addToFolderOpen: true,
      },
    };

    const action: Action = {
      type: 'LICENSE_COMMIT',
      payload: { licenseKey: 'new-license-key' },
    };

    const nextState = appReducer(populatedState, action);

    expect(nextState.licenseScopeRevision).toBe(2);
    expect(nextState.config.licenseKey).toBe('new-license-key');
    expect(nextState.config.apiKey).toBe('fixed-api-key');
    expect(nextState.license).toEqual({
      key: 'new-license-key',
      status: 'unknown',
      expiresAt: null,
      lastValidatedAt: null,
    });
    expect(nextState.sync).toEqual({
      phase: 'idle',
      lastResult: null,
      error: null,
      notice: null,
    });
    expect(nextState.folders).toEqual({
      status: 'loading',
      folders: [],
    });
    expect(nextState.ui.addToFolderOpen).toBe(false);
    expect(nextState.ui.organizerOpen).toBe(true);
    expect(nextState.ui.settingsOpen).toBe(true);
  });

  it('guards LICENSE_STATUS with revision checks', () => {
    const state: AppState = { ...initialState, licenseScopeRevision: 3 };

    const staleAction: Action = {
      type: 'LICENSE_STATUS',
      payload: { status: 'valid', expiresAt: 12345, lastValidatedAt: 67890 },
      revision: 2,
    };
    const afterStale = appReducer(state, staleAction);
    expect(afterStale).toBe(state);
    expect(afterStale.license.status).toBe('unknown');

    const matchingAction: Action = {
      type: 'LICENSE_STATUS',
      payload: { status: 'valid', expiresAt: 12345, lastValidatedAt: 67890 },
      revision: 3,
    };
    const afterMatching = appReducer(state, matchingAction);
    expect(afterMatching.license.status).toBe('valid');
    expect(afterMatching.license.expiresAt).toBe(12345);
  });

  it('guards SYNC_STATUS with revision checks', () => {
    const state: AppState = { ...initialState, licenseScopeRevision: 4 };

    const staleAction: Action = {
      type: 'SYNC_STATUS',
      payload: { phase: 'ok', lastResult: 'Stale sync' },
      revision: 3,
    };
    const afterStale = appReducer(state, staleAction);
    expect(afterStale).toBe(state);
    expect(afterStale.sync.phase).toBe('idle');

    const matchingAction: Action = {
      type: 'SYNC_STATUS',
      payload: { phase: 'ok', lastResult: 'Current sync' },
      revision: 4,
    };
    const afterMatching = appReducer(state, matchingAction);
    expect(afterMatching.sync.phase).toBe('ok');
    expect(afterMatching.sync.lastResult).toBe('Current sync');
  });

  it('guards FOLDERS_UPDATE with revision checks', () => {
    const state: AppState = { ...initialState, licenseScopeRevision: 5 };

    const staleAction: Action = {
      type: 'FOLDERS_UPDATE',
      payload: {
        status: 'ready',
        folders: [
          { id: 'stale-1', name: 'Stale', color: '#000', sort_order: 0, courses: [], course_count: 0 },
        ],
      },
      revision: 4,
    };
    const afterStale = appReducer(state, staleAction);
    expect(afterStale).toBe(state);
    expect(afterStale.folders.folders).toEqual([]);

    const matchingAction: Action = {
      type: 'FOLDERS_UPDATE',
      payload: {
        status: 'ready',
        folders: [
          { id: 'fresh-1', name: 'Fresh', color: '#000', sort_order: 0, courses: [], course_count: 0 },
        ],
      },
      revision: 5,
    };
    const afterMatching = appReducer(state, matchingAction);
    expect(afterMatching.folders.folders).toHaveLength(1);
    expect(afterMatching.folders.folders[0].id).toBe('fresh-1');
  });

  it('guards NOTICE_PUSH with revision checks', () => {
    const state: AppState = { ...initialState, licenseScopeRevision: 2 };

    const staleAction: Action = {
      type: 'NOTICE_PUSH',
      payload: { kind: 'error', text: 'Stale notice' },
      revision: 1,
    };
    const afterStale = appReducer(state, staleAction);
    expect(afterStale.sync.notice).toBeNull();

    const matchingAction: Action = {
      type: 'NOTICE_PUSH',
      payload: { kind: 'error', text: 'Current notice' },
      revision: 2,
    };
    const afterMatching = appReducer(state, matchingAction);
    expect(afterMatching.sync.notice).toEqual({ kind: 'error', text: 'Current notice' });
  });

  it('rejects initial key A results in an A -> B -> A sequence due to monotonic revision', () => {
    // Start with key A (revision 0)
    let state: AppState = {
      ...initialState,
      licenseScopeRevision: 0,
      config: { ...initialState.config, licenseKey: 'key-A' },
      license: { ...initialState.license, key: 'key-A' },
    };

    // Transition to key B (revision 1)
    state = appReducer(state, {
      type: 'LICENSE_COMMIT',
      payload: { licenseKey: 'key-B' },
    });
    expect(state.licenseScopeRevision).toBe(1);
    expect(state.config.licenseKey).toBe('key-B');

    // Transition back to key A (revision 2)
    state = appReducer(state, {
      type: 'LICENSE_COMMIT',
      payload: { licenseKey: 'key-A' },
    });
    expect(state.licenseScopeRevision).toBe(2);
    expect(state.config.licenseKey).toBe('key-A');

    // Late result from original key A (captured at revision 0)
    const lateAAction: Action = {
      type: 'FOLDERS_UPDATE',
      payload: {
        status: 'ready',
        folders: [{ id: 'old-a-folder', name: 'Old A Folder', color: '#111', sort_order: 0, courses: [], course_count: 0 }],
      },
      revision: 0,
    };
    const resultState = appReducer(state, lateAAction);
    expect(resultState.folders.folders).toEqual([]);
  });

  describe('COURSE_PROGRESS_UPDATE', () => {
    const multiFolderState: AppState = {
      ...initialState,
      licenseScopeRevision: 3,
      folders: {
        status: 'ready',
        folders: [
          {
            id: 'folder-1',
            name: 'Folder 1',
            color: '#111',
            sort_order: 0,
            course_count: 1,
            courses: [
              {
                id: 'course-guid-1',
                udemy_course_id: '100',
                folder_id: 'folder-1',
                title: 'Course 1',
                url: '/course/c1',
                progress: 10,
                is_completed: false,
                last_lesson_url: null,
                added_at: 1,
              },
            ],
          },
          {
            id: 'folder-2',
            name: 'Folder 2',
            color: '#222',
            sort_order: 1,
            course_count: 1,
            courses: [
              {
                id: 'course-guid-1',
                udemy_course_id: '100',
                folder_id: 'folder-2',
                title: 'Course 1',
                url: '/course/c1',
                progress: 10,
                is_completed: false,
                last_lesson_url: null,
                added_at: 1,
              },
              {
                id: 'course-guid-2',
                udemy_course_id: '200',
                folder_id: 'folder-2',
                title: 'Course 2',
                url: '/course/c2',
                progress: 50,
                is_completed: false,
                last_lesson_url: null,
                added_at: 2,
              },
            ],
          },
        ],
      },
    };

    it('updates every folder copy of matching courseId', () => {
      const action: Action = {
        type: 'COURSE_PROGRESS_UPDATE',
        payload: {
          courseId: 'course-guid-1',
          progress: 80,
          is_completed: false,
          last_lesson_url: '/course/c1/learn/lecture/5',
        },
        revision: 3,
      };

      const nextState = appReducer(multiFolderState, action);

      // Both folder 1 and folder 2 have course-guid-1 updated
      expect(nextState.folders.folders[0].courses[0].progress).toBe(80);
      expect(nextState.folders.folders[0].courses[0].last_lesson_url).toBe('/course/c1/learn/lecture/5');
      expect(nextState.folders.folders[1].courses[0].progress).toBe(80);
      expect(nextState.folders.folders[1].courses[0].last_lesson_url).toBe('/course/c1/learn/lecture/5');

      // Unrelated course remains unchanged
      expect(nextState.folders.folders[1].courses[1].progress).toBe(50);
    });

    it('ignores updates with stale revision', () => {
      const action: Action = {
        type: 'COURSE_PROGRESS_UPDATE',
        payload: {
          courseId: 'course-guid-1',
          progress: 80,
          is_completed: false,
          last_lesson_url: '/course/c1/learn/lecture/5',
        },
        revision: 2, // stale (current is 3)
      };

      const nextState = appReducer(multiFolderState, action);
      expect(nextState).toBe(multiFolderState);
      expect(nextState.folders.folders[0].courses[0].progress).toBe(10);
    });
  });
});
