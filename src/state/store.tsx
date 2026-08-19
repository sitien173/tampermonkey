import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AppState, Action, Config } from './types';

export const DEFAULT_CONFIG: Config = {
  licenseKey: '',
  apiKey: 'ZDksovkGHYUqwK8k9hoDCKHSP2geS6WB',
};

const CONFIG_KEYS: ReadonlyArray<keyof Config> = ['licenseKey', 'apiKey'];

export function loadStoredConfig(stored: unknown): Config {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_CONFIG };
  const src = stored as Record<string, unknown>;
  const result: Config = { ...DEFAULT_CONFIG };
  for (const key of CONFIG_KEYS) {
    if (key in src && src[key] !== undefined) {
      (result as unknown as Record<string, unknown>)[key] = src[key];
    }
  }
  return result;
}

const getInitialState = (): AppState => {
  let stored: unknown;
  if (typeof GM_getValue !== 'undefined') {
    stored = GM_getValue('config', undefined);
  }
  const loadedConfig = loadStoredConfig(stored);

  return {
    licenseScopeRevision: 0,
    config: loadedConfig,
    license: {
      key: loadedConfig.licenseKey || '',
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
};

function getActionRevision(action: Action): number | undefined {
  if ('revision' in action && action.revision !== undefined) {
    return action.revision;
  }
  if ('payload' in action && action.payload && typeof action.payload === 'object' && 'revision' in action.payload) {
    const rev = (action.payload as Record<string, unknown>).revision;
    if (typeof rev === 'number') {
      return rev;
    }
  }
  return undefined;
}

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'CONFIG_UPDATE':
      return {
        ...state,
        config: { ...state.config, ...action.payload },
      };
    case 'LICENSE_COMMIT': {
      const newKey = action.payload.licenseKey;
      return {
        ...state,
        licenseScopeRevision: state.licenseScopeRevision + 1,
        config: {
          ...state.config,
          licenseKey: newKey,
        },
        license: {
          key: newKey,
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
          status: 'loading',
          folders: [],
        },
        ui: {
          ...state.ui,
          addToFolderOpen: false,
        },
      };
    }
    case 'LICENSE_STATUS': {
      const actionRev = getActionRevision(action);
      if (actionRev !== undefined && actionRev !== state.licenseScopeRevision) {
        return state;
      }
      return {
        ...state,
        license: { ...state.license, ...action.payload },
      };
    }
    case 'SYNC_STATUS': {
      const actionRev = getActionRevision(action);
      if (actionRev !== undefined && actionRev !== state.licenseScopeRevision) {
        return state;
      }
      return {
        ...state,
        sync: { ...state.sync, ...action.payload },
      };
    }
    case 'UI_TOGGLE':
      return {
        ...state,
        ui: {
          ...state.ui,
          [action.payload.key]: action.payload.value,
        },
      };
    case 'FOLDERS_UPDATE': {
      const actionRev = getActionRevision(action);
      if (actionRev !== undefined && actionRev !== state.licenseScopeRevision) {
        return state;
      }
      return {
        ...state,
        folders: { ...state.folders, ...action.payload },
      };
    }
    case 'COURSE_PROGRESS_UPDATE': {
      const actionRev = getActionRevision(action);
      if (actionRev !== undefined && actionRev !== state.licenseScopeRevision) {
        return state;
      }
      const { courseId, progress, is_completed, last_lesson_url } = action.payload;
      return {
        ...state,
        folders: {
          ...state.folders,
          folders: state.folders.folders.map((folder) => ({
            ...folder,
            courses: folder.courses.map((course) =>
              course.id === courseId
                ? {
                    ...course,
                    progress,
                    is_completed,
                    last_lesson_url,
                  }
                : course
            ),
          })),
        },
      };
    }
    case 'NOTICE_PUSH': {
      const actionRev = getActionRevision(action);
      if (actionRev !== undefined && actionRev !== state.licenseScopeRevision) {
        return state;
      }
      return {
        ...state,
        sync: {
          ...state.sync,
          notice: action.payload,
        },
      };
    }
    case 'NOTICE_CLEAR':
      return {
        ...state,
        sync: {
          ...state.sync,
          notice: null,
        },
      };
    default:
      return state;
  }
}

type AppStateContextType = {
  state: AppState;
  dispatch: React.Dispatch<Action>;
};

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, getInitialState);

  useEffect(() => {
    if (typeof GM_setValue !== 'undefined') {
      GM_setValue('config', state.config);
    }
  }, [state.config]);

  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      {children}
    </AppStateContext.Provider>
  );
}
