import { useEffect, useCallback } from 'react';
import { useAppState } from '../../state/store';
import { Folder, FoldersState } from '../../state/types';
import {
  fetchSync,
  createFolder as apiCreateFolder,
  updateFolder as apiUpdateFolder,
  deleteFolder as apiDeleteFolder,
} from '../../lib/api';
import { generateUUID } from '../../lib/uuid';
import { sortFoldersByOrder } from './sort';

export function useFolders(): {
  folders: Folder[];
  status: FoldersState['status'];
  refresh: () => Promise<void>;
  createFolder: (name: string, color: string) => Promise<void>;
  updateFolder: (id: string, updates: Partial<Folder>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
} {
  const { state, dispatch } = useAppState();
  const { config, folders: foldersState, licenseScopeRevision } = state;

  const refresh = useCallback(async () => {
    const capturedRevision = state.licenseScopeRevision;
    if (config.licenseKey) {
      dispatch({ type: 'FOLDERS_UPDATE', payload: { status: 'loading' }, revision: capturedRevision });
      const res = await fetchSync(config);
      if (res.ok) {
        dispatch({
          type: 'FOLDERS_UPDATE',
          payload: { status: 'ready', folders: res.data.folders },
          revision: capturedRevision,
        });
      } else {
        dispatch({
          type: 'FOLDERS_UPDATE',
          payload: { status: 'error' },
          revision: capturedRevision,
        });
      }
    } else {
      dispatch({
        type: 'FOLDERS_UPDATE',
        payload: { status: 'ready', folders: [] },
        revision: capturedRevision,
      });
    }
  }, [config, dispatch, state.licenseScopeRevision]);

  useEffect(() => {
    refresh();
  }, [config.licenseKey, licenseScopeRevision]);

  const createFolder = useCallback(async (name: string, color: string) => {
    if (config.licenseKey) {
      const res = await apiCreateFolder(config, { name, color });
      if (res.ok) {
        await refresh();
      } else {
        throw new Error(res.error);
      }
    } else {
      const newFolder: Folder = {
        id: generateUUID(),
        name,
        color,
        sort_order: foldersState.folders.length,
        courses: [],
        course_count: 0,
      };
      dispatch({
        type: 'FOLDERS_UPDATE',
        payload: { folders: [...foldersState.folders, newFolder] },
        revision: state.licenseScopeRevision,
      });
    }
  }, [config, foldersState.folders, refresh, dispatch, state.licenseScopeRevision]);

  const updateFolder = useCallback(async (id: string, updates: Partial<Folder>) => {
    if (config.licenseKey) {
      const res = await apiUpdateFolder(config, id, updates);
      if (res.ok) {
        await refresh();
      } else {
        throw new Error(res.error);
      }
    } else {
      const updated = foldersState.folders.map(f => f.id === id ? { ...f, ...updates } : f);
      dispatch({
        type: 'FOLDERS_UPDATE',
        payload: { folders: updated },
        revision: state.licenseScopeRevision,
      });
    }
  }, [config, foldersState.folders, refresh, dispatch, state.licenseScopeRevision]);

  const deleteFolder = useCallback(async (id: string) => {
    if (config.licenseKey) {
      const res = await apiDeleteFolder(config, id);
      if (res.ok) {
        await refresh();
      } else {
        throw new Error(res.error);
      }
    } else {
      const filtered = foldersState.folders.filter(f => f.id !== id);
      dispatch({
        type: 'FOLDERS_UPDATE',
        payload: { folders: filtered },
        revision: state.licenseScopeRevision,
      });
    }
  }, [config, foldersState.folders, refresh, dispatch, state.licenseScopeRevision]);

  const sortedFolders = sortFoldersByOrder(foldersState.folders);

  return {
    folders: sortedFolders,
    status: foldersState.status,
    refresh,
    createFolder,
    updateFolder,
    deleteFolder,
  };
}
