import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Fab } from '../Fab';
import { AppStateProvider, useAppState } from '../../../state/store';
import { useCourseContext } from '../useCourseContext';

// Hoist mocks for hooks
const { mockTriggerSync, mockSwitchNow, mockHealthyDomainState } = vi.hoisted(() => ({
  mockTriggerSync: vi.fn(),
  mockSwitchNow: vi.fn(),
  mockHealthyDomainState: { status: 'idle' },
}));

// Mock the useCourseContext hook
vi.mock('../useCourseContext', () => ({
  useCourseContext: vi.fn(),
}));

// Mock SyncTriggerContext
vi.mock('../../cookie-sync/SyncTriggerContext', () => ({
  useSyncTrigger: () => ({
    triggerSync: mockTriggerSync,
  }),
  SyncTriggerProvider: ({ children }: any) => children,
}));

// Mock useHealthyDomainSwitch
vi.mock('../../healthy-domain/useHealthyDomainSwitch', () => ({
  useHealthyDomainSwitch: () => ({
    status: mockHealthyDomainState.status,
    snapshot: null,
    error: null,
    switchNow: mockSwitchNow,
    autoCheckOnSyncFailure: vi.fn(),
  }),
}));

// Helper component to check state in tests
const TestStateInspector: React.FC = () => {
  const { state } = useAppState();
  return (
    <div data-testid="state-inspector">
      <div data-testid="settingsOpen">{state.ui.settingsOpen.toString()}</div>
      <div data-testid="organizerOpen">{state.ui.organizerOpen.toString()}</div>
      <div data-testid="addToFolderOpen">{state.ui.addToFolderOpen.toString()}</div>
    </div>
  );
};

describe('Fab component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the FAB trigger unconditionally', () => {
    vi.mocked(useCourseContext).mockReturnValue(null);
    render(
      <AppStateProvider>
        <Fab />
      </AppStateProvider>
    );
    expect(screen.getByRole('button', { name: /open menu/i })).toBeTruthy();
  });

  it('opens the menu on trigger click and does NOT show Add-to-Folder if no course context is present', () => {
    vi.mocked(useCourseContext).mockReturnValue(null);
    render(
      <AppStateProvider>
        <Fab />
      </AppStateProvider>
    );

    const trigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: /settings/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /organize folders/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /re-sync cookies/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /switch domain/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /add to folder/i })).toBeNull();
  });

  it('shows Add-to-Folder if course context is present', () => {
    vi.mocked(useCourseContext).mockReturnValue({
      id: 'test-course',
      title: 'Test Course',
      url: 'https://www.udemy.com/course/test-course/',
      addedAt: Date.now(),
    });

    render(
      <AppStateProvider>
        <Fab />
      </AppStateProvider>
    );

    const trigger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: /add to folder/i })).toBeTruthy();
  });

  it('dispatches the toggle actions and closes menu when Settings/Organizer/Add-to-Folder are clicked', () => {
    vi.mocked(useCourseContext).mockReturnValue({
      id: 'test-course',
      title: 'Test Course',
      url: 'https://www.udemy.com/course/test-course/',
      addedAt: Date.now(),
    });

    render(
      <AppStateProvider>
        <Fab />
        <TestStateInspector />
      </AppStateProvider>
    );

    // Test settings click
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByTestId('settingsOpen').textContent).toBe('true');

    // Test organizer click
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /organize folders/i }));
    expect(screen.getByTestId('organizerOpen').textContent).toBe('true');

    // Test add to folder click
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /add to folder/i }));
    expect(screen.getByTestId('addToFolderOpen').textContent).toBe('true');
  });

  it('closes the menu on Esc key down', () => {
    vi.mocked(useCourseContext).mockReturnValue(null);
    render(
      <AppStateProvider>
        <Fab />
      </AppStateProvider>
    );

    // Open menu
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('button', { name: /settings/i })).toBeTruthy();

    // Press Esc
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /settings/i })).toBeNull();
  });

  it('closes the menu on click outside', () => {
    vi.mocked(useCourseContext).mockReturnValue(null);
    render(
      <AppStateProvider>
        <div>
          <Fab />
          <div data-testid="outside">Outside</div>
        </div>
      </AppStateProvider>
    );

    // Open menu
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('button', { name: /settings/i })).toBeTruthy();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('button', { name: /settings/i })).toBeNull();
  });

  it('Re-sync click invokes triggerSync and closes menu', () => {
    vi.mocked(useCourseContext).mockReturnValue(null);
    render(
      <AppStateProvider>
        <Fab />
      </AppStateProvider>
    );

    // Open menu
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    // Click Re-sync button
    const btn = screen.getByRole('button', { name: /re-sync cookies/i });
    fireEvent.click(btn);

    expect(mockTriggerSync).toHaveBeenCalledTimes(1);
    // Should also close FAB
    expect(screen.queryByRole('button', { name: /settings/i })).toBeNull();
  });

  it('Re-sync is disabled when state.sync.phase is syncing', () => {
    vi.mocked(useCourseContext).mockReturnValue(null);
    
    const SyncStateMutator: React.FC<{ phase: any }> = ({ phase }) => {
      const { dispatch } = useAppState();
      React.useEffect(() => {
        dispatch({ type: 'SYNC_STATUS', payload: { phase, error: null } });
      }, [phase, dispatch]);
      return null;
    };

    render(
      <AppStateProvider>
        <SyncStateMutator phase="syncing" />
        <Fab />
      </AppStateProvider>
    );

    // Open menu
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    // Click Re-sync button
    const btn = screen.getByRole('button', { name: /re-sync cookies/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('Switch-domain click invokes switchNow and closes menu', () => {
    vi.mocked(useCourseContext).mockReturnValue(null);
    mockHealthyDomainState.status = 'idle';
    render(
      <AppStateProvider>
        <Fab />
      </AppStateProvider>
    );

    // Open menu
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    // Click Switch domain button
    const btn = screen.getByRole('button', { name: /switch domain/i });
    fireEvent.click(btn);

    expect(mockSwitchNow).toHaveBeenCalledTimes(1);
    // Should also close FAB
    expect(screen.queryByRole('button', { name: /settings/i })).toBeNull();
  });

  it('Switch-domain is disabled when status is unreachable', () => {
    vi.mocked(useCourseContext).mockReturnValue(null);
    mockHealthyDomainState.status = 'unreachable';
    render(
      <AppStateProvider>
        <Fab />
      </AppStateProvider>
    );

    // Open menu
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    // Click Switch domain button
    const btn = screen.getByRole('button', { name: /switch domain/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});
