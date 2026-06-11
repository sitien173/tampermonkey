import React, { useEffect, useState } from 'react';
import { useAppState } from '../../state/store';
import './index.css';

export const StatusIndicator: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { phase, error, lastResult, notice } = state.sync;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (phase === 'idle') {
      setVisible(false);
    } else if (phase === 'syncing' || phase === 'error') {
      setVisible(true);
    } else if (phase === 'ok') {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  useEffect(() => {
    if (notice) {
      const ttl = notice.ttl ?? 4000;
      const timer = setTimeout(() => {
        dispatch({ type: 'NOTICE_CLEAR' });
      }, ttl);
      return () => clearTimeout(timer);
    }
  }, [notice, dispatch]);

  const showSyncBadge = phase !== 'idle' && visible;
  const showNoticeBadge = !!notice;

  if (!showSyncBadge && !showNoticeBadge) {
    return null;
  }

  const getNoticeConfig = (kind: 'info' | 'error' | 'success') => {
    switch (kind) {
      case 'success':
        return {
          badgeClass: 'status-ok',
          icon: (
            <div className="sync-checkmark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          ),
        };
      case 'error':
        return {
          badgeClass: 'status-error',
          icon: (
            <div className="sync-error-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </div>
          ),
        };
      case 'info':
      default:
        return {
          badgeClass: 'status-syncing',
          icon: (
            <div className="sync-spinner" style={{ animation: 'none', border: '2px solid var(--color-action-interactive)' }} />
          ),
        };
    }
  };

  return (
    <div className="sync-indicator-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
      {showSyncBadge && (
        <div className={`sync-indicator-badge status-${phase}`}>
          <div className="sync-indicator-icon-container">
            {phase === 'syncing' && <div className="sync-spinner" />}
            {phase === 'ok' && (
              <div className="sync-checkmark">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            )}
            {phase === 'error' && (
              <div className="sync-error-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </div>
            )}
          </div>
          <span className="sync-indicator-text ff-label-sm">
            {phase === 'syncing' && 'Syncing...'}
            {phase === 'ok' && (
              <>
                Synced
                {lastResult && <span className="sync-indicator-detail ff-text-xs">({lastResult})</span>}
              </>
            )}
            {phase === 'error' && `Sync error: ${error || 'Unknown error'}`}
          </span>
        </div>
      )}

      {showNoticeBadge && notice && (() => {
        const config = getNoticeConfig(notice.kind);
        return (
          <div className={`sync-indicator-badge ${config.badgeClass}`}>
            <div className="sync-indicator-icon-container">
              {config.icon}
            </div>
            <span className="sync-indicator-text ff-label-sm">
              {notice.text}
            </span>
          </div>
        );
      })()}
    </div>
  );
};
