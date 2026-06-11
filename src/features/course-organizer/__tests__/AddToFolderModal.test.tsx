import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddToFolderModal } from '../AddToFolderModal';
import { AppStateProvider, useAppState } from '../../../state/store';
import { useCourseContext } from '../../fab/useCourseContext';
import { useFolders } from '../../folder-organizer/useFolders';
import { useAddCourse } from '../useAddCourse';

// Mock the hooks
vi.mock('../../fab/useCourseContext', () => ({
  useCourseContext: vi.fn(),
}));

vi.mock('../../folder-organizer/useFolders', () => ({
  useFolders: vi.fn(),
}));

vi.mock('../useAddCourse', () => ({
  useAddCourse: vi.fn(),
}));

const TestStateInspector: React.FC = () => {
  const { state } = useAppState();
  return (
    <div data-testid="state-inspector">
      <div data-testid="addToFolderOpen">{state.ui.addToFolderOpen.toString()}</div>
    </div>
  );
};

const TestAppWrapper: React.FC = () => {
  const { dispatch } = useAppState();
  useEffect(() => {
    dispatch({
      type: 'UI_TOGGLE',
      payload: { key: 'addToFolderOpen', value: true },
    });
  }, [dispatch]);

  return (
    <>
      <AddToFolderModal />
      <TestStateInspector />
    </>
  );
};

describe('AddToFolderModal', () => {
  const mockCourse = {
    id: 'test-course-id',
    title: 'Test Course Title',
    image: 'https://image.png',
    url: 'https://course-url',
    instructor: 'Test Instructor',
    addedAt: 123,
  };

  const mockFolders = [
    { id: 'f1', name: 'Folder 1', color: '#ff0000', sort_order: 1, courses: [], course_count: 0 },
    {
      id: 'f2',
      name: 'Folder 2',
      color: '#00ff00',
      sort_order: 2,
      courses: [
        {
          id: 'junction-1',
          udemy_course_id: 'test-course-id',
          folder_id: 'f2',
          title: 'Test Course Title',
          url: 'https://course-url',
          added_at: 123,
        },
      ],
      course_count: 1,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCourseContext).mockReturnValue(mockCourse);
    vi.mocked(useFolders).mockReturnValue({
      folders: mockFolders,
      status: 'ready',
      refresh: vi.fn(),
      createFolder: vi.fn(),
      updateFolder: vi.fn(),
      deleteFolder: vi.fn(),
    });
    vi.mocked(useAddCourse).mockReturnValue({
      submit: vi.fn().mockResolvedValue({ ok: true, added: 1 }),
      status: 'idle',
    });
  });

  it('renders nothing if course context is missing', () => {
    vi.mocked(useCourseContext).mockReturnValue(null);
    render(
      <AppStateProvider>
        <AddToFolderModal />
      </AppStateProvider>
    );
    expect(screen.queryByText('Test Course Title')).toBeNull();
  });

  it('renders header, folder list, and footer', () => {
    render(
      <AppStateProvider>
        <TestAppWrapper />
      </AppStateProvider>
    );

    expect(screen.getByText('Test Course Title')).toBeTruthy();
    expect(screen.getByText('Test Instructor')).toBeTruthy();
    expect(screen.getByAltText('Test Course Title')).toBeTruthy();
    expect(screen.getByText('Folder 1')).toBeTruthy();
    expect(screen.getByText('Folder 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();
  });

  it('pre-checks folders that already contain the course', () => {
    render(
      <AppStateProvider>
        <TestAppWrapper />
      </AppStateProvider>
    );

    const checkbox1 = screen.getByLabelText('Folder 1') as HTMLInputElement;
    const checkbox2 = screen.getByLabelText('Folder 2') as HTMLInputElement;

    expect(checkbox1.checked).toBe(false);
    expect(checkbox2.checked).toBe(true);
  });

  it('disables Save button until selection differs from initial set', () => {
    render(
      <AppStateProvider>
        <TestAppWrapper />
      </AppStateProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    const checkbox1 = screen.getByLabelText('Folder 1');
    fireEvent.click(checkbox1);

    expect(saveBtn.disabled).toBe(false);

    // Toggle back to initial state
    fireEvent.click(checkbox1);
    expect(saveBtn.disabled).toBe(true);
  });

  it('calls submit and closes modal on save success', async () => {
    const submitMock = vi.fn().mockResolvedValue({ ok: true, added: 1 });
    vi.mocked(useAddCourse).mockReturnValue({
      submit: submitMock,
      status: 'idle',
    });

    render(
      <AppStateProvider>
        <TestAppWrapper />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByLabelText('Folder 1'));

    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);

    expect(submitMock).toHaveBeenCalledWith('test-course-id', expect.arrayContaining(['f1', 'f2']));
    await waitFor(() => {
      expect(screen.getByTestId('addToFolderOpen').textContent).toBe('false');
    });
  });

  it('keeps modal open and displays error banner on save failure', async () => {
    const submitMock = vi.fn().mockResolvedValue({ ok: false, message: 'Rate limit hit' });
    vi.mocked(useAddCourse).mockReturnValue({
      submit: submitMock,
      status: 'idle',
    });

    render(
      <AppStateProvider>
        <TestAppWrapper />
      </AppStateProvider>
    );

    fireEvent.click(screen.getByLabelText('Folder 1'));

    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Rate limit hit')).toBeTruthy();
      expect(screen.getByTestId('addToFolderOpen').textContent).toBe('true');
    });
  });
});
