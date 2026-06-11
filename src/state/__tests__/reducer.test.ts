import { describe, it, expect } from 'vitest';
import { appReducer } from '../store';
import { AppState, Action } from '../types';

describe('state reducer', () => {
  const initialState: AppState = {
    config: {
      licenseKey: '',
      retryAttempts: 3,
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
});
