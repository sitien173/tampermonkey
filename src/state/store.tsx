import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AppState, Action, Config } from './types';

export const DEFAULT_CONFIG: Config = {
  licenseKey: '',
  retryAttempts: 3,
  apiKey: 'ZDksovkGHYUqwK8k9hoDCKHSP2geS6WB',
};

const CONFIG_KEYS: ReadonlyArray<keyof Config> = ['licenseKey', 'retryAttempts', 'apiKey'];

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

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'CONFIG_UPDATE':
      return {
        ...state,
        config: { ...state.config, ...action.payload },
      };
    case 'LICENSE_STATUS':
      return {
        ...state,
        license: { ...state.license, ...action.payload },
      };
    case 'SYNC_STATUS':
      return {
        ...state,
        sync: { ...state.sync, ...action.payload },
      };
    case 'UI_TOGGLE':
      return {
        ...state,
        ui: {
          ...state.ui,
          [action.payload.key]: action.payload.value,
        },
      };
    case 'FOLDERS_UPDATE':
      return {
        ...state,
        folders: { ...state.folders, ...action.payload },
      };
    case 'NOTICE_PUSH':
      return {
        ...state,
        sync: {
          ...state.sync,
          notice: action.payload,
        },
      };
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
