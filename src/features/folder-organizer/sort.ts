import { Folder } from '../../state/types';

/**
 * Returns a new array of folders sorted ascending by sort_order.
 * Ties (equal sort_order) are broken by insertion order (stable sort).
 */
export function sortFoldersByOrder(folders: Folder[]): Folder[] {
  return [...folders].sort((a, b) => a.sort_order - b.sort_order);
}
