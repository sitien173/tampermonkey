const RELOAD_MARKER = 'cookie-updater:reload-after-import';

export function reloadAfterCookieImport(
  operationCount: number,
  reload: () => void = () => window.location.reload(),
  storage: Storage = window.sessionStorage
): void {
  if (storage.getItem(RELOAD_MARKER)) {
    return;
  }

  if (operationCount > 0) {
    storage.setItem(RELOAD_MARKER, '1');
    reload();
  }
}
