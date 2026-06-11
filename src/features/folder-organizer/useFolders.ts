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
  const { config, folders: foldersState } = state;

  const refresh = useCallback(async () => {
    if (config.licenseKey) {
      dispatch({ type: 'FOLDERS_UPDATE', payload: { status: 'loading' } });
      const res = await fetchSync(config);
      if (res.ok) {
        dispatch({ type: 'FOLDERS_UPDATE', payload: { status: 'ready', folders: res.data.folders } });
      } else {
        dispatch({ type: 'FOLDERS_UPDATE', payload: { status: 'error' } });
      }
    } else {
      // In local mode, if we are currently empty or status is idle/error, load defaults
      if (foldersState.status === 'idle' || foldersState.status === 'error' || foldersState.folders.length === 0) {
        const defaults: Folder[] = [
          { id: generateUUID(), name: 'My Courses', color: '#6366f1', courses: [], course_count: 0, sort_order: 0 },
          { id: generateUUID(), name: 'Favorites', color: '#ec4899', courses: [], course_count: 0, sort_order: 1 },
          { id: generateUUID(), name: 'In Progress', color: '#f59e0b', courses: [], course_count: 0, sort_order: 2 },
          { id: generateUUID(), name: 'Completed', color: '#10b981', courses: [], course_count: 0, sort_order: 3 },
        ];
        dispatch({ type: 'FOLDERS_UPDATE', payload: { status: 'ready', folders: defaults } });
      } else {
        dispatch({ type: 'FOLDERS_UPDATE', payload: { status: 'ready' } });
      }
    }
  }, [config.licenseKey, dispatch, foldersState.status, foldersState.folders.length]);

  useEffect(() => {
    refresh();
  }, [config.licenseKey]);

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
      });
    }
  }, [config, foldersState.folders, refresh, dispatch]);

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
      });
    }
  }, [config, foldersState.folders, refresh, dispatch]);

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
      });
    }
  }, [config, foldersState.folders, refresh, dispatch]);

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
