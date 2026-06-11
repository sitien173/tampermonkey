import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StatusIndicator } from '../StatusIndicator';
import { AppStateProvider, useAppState } from '../../../state/store';

const DispatchHelper: React.FC = () => {
  const { dispatch } = useAppState();
  return (
    <div>
      <button
        data-testid="dispatch-notice-btn"
        onClick={() => {
          dispatch({
            type: 'NOTICE_PUSH',
            payload: { kind: 'success', text: 'Operation complete', ttl: 100 },
          });
        }}
      >
        Dispatch Notice
      </button>
      <button
        data-testid="dispatch-sync-btn"
        onClick={() => {
          dispatch({
            type: 'SYNC_STATUS',
            payload: { phase: 'syncing' }
          });
        }}
      >
        Dispatch Syncing
      </button>
    </div>
  );
};

describe('StatusIndicator notice channel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sync notices when pushed, and auto-clears after TTL', async () => {
    render(
      <AppStateProvider>
        <StatusIndicator />
        <DispatchHelper />
      </AppStateProvider>
    );

    expect(screen.queryByText('Operation complete')).toBeNull();

    const btn = screen.getByTestId('dispatch-notice-btn');
    act(() => {
      btn.click();
    });

    expect(screen.getByText('Operation complete')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.queryByText('Operation complete')).toBeNull();
  });

  it('renders sync phase and notice concurrently without regression', () => {
    render(
      <AppStateProvider>
        <StatusIndicator />
        <DispatchHelper />
      </AppStateProvider>
    );

    act(() => {
      screen.getByTestId('dispatch-sync-btn').click();
    });
    act(() => {
      screen.getByTestId('dispatch-notice-btn').click();
    });

    expect(screen.getByText('Syncing...')).toBeTruthy();
    expect(screen.getByText('Operation complete')).toBeTruthy();
  });
});
