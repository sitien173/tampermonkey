import { describe, expect, it, vi } from 'vitest';
import { reloadAfterCookieImport } from './reload';

describe('reloadAfterCookieImport', () => {
  it('reloads after cookies were changed', () => {
    const reload = vi.fn();
    const storage = createStorage();

    reloadAfterCookieImport(1, reload, storage);

    expect(reload).toHaveBeenCalledOnce();
    expect(storage.getItem('cookie-updater:reload-after-import')).toBe('1');
  });

  it('does not reload when synchronization made no changes', () => {
    const reload = vi.fn();
    const storage = createStorage();

    reloadAfterCookieImport(0, reload, storage);

    expect(reload).not.toHaveBeenCalled();
  });

  it('suppresses later reloads in the same tab after an import-triggered reload', () => {
    const reload = vi.fn();
    const storage = createStorage();
    storage.setItem('cookie-updater:reload-after-import', '1');

    reloadAfterCookieImport(1, reload, storage);
    reloadAfterCookieImport(1, reload, storage);

    expect(reload).not.toHaveBeenCalled();
    expect(storage.getItem('cookie-updater:reload-after-import')).toBe('1');
  });
});

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
