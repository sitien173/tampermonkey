export interface Config {
  licenseKey: string;
  apiKey: string;
}

export interface LicenseState {
  key: string;
  status: 'unknown' | 'valid' | 'invalid' | 'expired' | 'checking';
  expiresAt: number | null;   // unix seconds
  lastValidatedAt: number | null;
}

export interface SyncState {
  phase: 'idle' | 'syncing' | 'ok' | 'error';
  lastResult: string | null;
  error: string | null;
  notice?: { kind: 'info' | 'error' | 'success'; text: string; ttl?: number } | null;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  icon?: string;
  sort_order: number;
  is_default?: boolean;
  courses: Course[];
  course_count: number;
}

export interface Course {
  id: string;
  udemy_course_id: string;
  folder_id: string;
  title: string;
  url: string;
  image_url?: string;
  instructor?: string;
  progress?: number;
  is_completed?: boolean;
  last_lesson_url?: string | null;
  added_at: number;
}

export interface FoldersState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  folders: Folder[];
}

export interface UIState {
  settingsOpen: boolean;
  organizerOpen: boolean;
  fabOpen: boolean;
  addToFolderOpen: boolean;
}

export interface AppState {
  licenseScopeRevision: number;
  config: Config;
  license: LicenseState;
  sync: SyncState;
  folders: FoldersState;
  ui: UIState;
}

export type Action =
  | { type: 'CONFIG_UPDATE'; payload: Partial<Config> }
  | { type: 'LICENSE_COMMIT'; payload: { licenseKey: string } }
  | { type: 'LICENSE_STATUS'; payload: Partial<LicenseState>; revision?: number }
  | { type: 'SYNC_STATUS'; payload: Partial<SyncState>; revision?: number }
  | { type: 'UI_TOGGLE'; payload: { key: keyof UIState; value: boolean } }
  | { type: 'FOLDERS_UPDATE'; payload: Partial<FoldersState>; revision?: number }
  | { type: 'COURSE_PROGRESS_UPDATE'; payload: { courseId: string; progress: number; is_completed: boolean; last_lesson_url: string | null }; revision?: number }
  | { type: 'NOTICE_PUSH'; payload: { kind: 'info' | 'error' | 'success'; text: string; ttl?: number }; revision?: number }
  | { type: 'NOTICE_CLEAR' };

export interface PublicDomainHealth {
  host: string;
  status: string; // "healthy" | "down" | "unknown"
  lastChecked: string | null; // ISO
}

export interface PublicHealthSnapshot {
  runAt: string; // ISO
  domains: PublicDomainHealth[];
}
