import { describe, it, expect } from 'vitest';
import { sortFoldersByOrder } from '../sort';
import { Folder } from '../../../state/types';

describe('sortFoldersByOrder', () => {
  it('sortFoldersByOrder_ReturnsEmpty_WhenEmpty', () => {
    const folders: Folder[] = [];
    const result = sortFoldersByOrder(folders);
    expect(result).toEqual([]);
  });

  it('sortFoldersByOrder_SortsByOrder_Ascending', () => {
    const folders = [
      { id: '1', name: 'F1', color: 'red', sort_order: 2, courses: [], course_count: 0 },
      { id: '2', name: 'F2', color: 'blue', sort_order: 0, courses: [], course_count: 0 },
      { id: '3', name: 'F3', color: 'green', sort_order: 1, courses: [], course_count: 0 },
    ] as Folder[];

    const result = sortFoldersByOrder(folders);
    expect(result.map(f => f.sort_order)).toEqual([0, 1, 2]);
    expect(result.map(f => f.name)).toEqual(['F2', 'F3', 'F1']);
  });

  it('sortFoldersByOrder_StableOnTie', () => {
    const folders = [
      { id: '1', name: 'F1', color: 'red', sort_order: 1, courses: [], course_count: 0 },
      { id: '2', name: 'F2', color: 'blue', sort_order: 1, courses: [], course_count: 0 },
    ] as Folder[];

    const result = sortFoldersByOrder(folders);
    expect(result.map(f => f.name)).toEqual(['F1', 'F2']);
  });

  it('sortFoldersByOrder_DoesNotMutate', () => {
    const folders = [
      { id: '1', name: 'F1', color: 'red', sort_order: 2, courses: [], course_count: 0 },
      { id: '2', name: 'F2', color: 'blue', sort_order: 1, courses: [], course_count: 0 },
    ] as Folder[];
    
    const inputCopy = [...folders];
    sortFoldersByOrder(folders);
    expect(folders).toEqual(inputCopy);
  });
});
