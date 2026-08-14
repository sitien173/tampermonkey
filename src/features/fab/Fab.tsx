import React, { useEffect, useRef } from 'react';
import { useAppState } from '../../state/store';
import { useCourseContext } from './useCourseContext';
import { useHealthyDomainSwitch } from '../healthy-domain/useHealthyDomainSwitch';
import './index.css';

export const Fab: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { fabOpen } = state.ui;
  const course = useCourseContext();
  const fabRef = useRef<HTMLDivElement>(null);
  const { status: healthyDomainStatus, switchNow } = useHealthyDomainSwitch();

  const toggleFab = () => {
    dispatch({ type: 'UI_TOGGLE', payload: { key: 'fabOpen', value: !fabOpen } });
  };

  useEffect(() => {
    const fab = fabRef.current;
    if (!fab) {
      return;
    }
    // Inside a closed shadow root, the document listener sees event.target
    // retargeted to the host, so containment can't be tested there. Record
    // mousedowns that pass through the FAB container before they reach the
    // document listener.
    let mousedownInside = false;
    const markInside = () => {
      mousedownInside = true;
    };
    const handleClickOutside = () => {
      if (mousedownInside) {
        mousedownInside = false;
        return;
      }
      dispatch({ type: 'UI_TOGGLE', payload: { key: 'fabOpen', value: false } });
    };
    fab.addEventListener('mousedown', markInside);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      fab.removeEventListener('mousedown', markInside);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [fabOpen, dispatch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (fabOpen && event.key === 'Escape') {
        dispatch({ type: 'UI_TOGGLE', payload: { key: 'fabOpen', value: false } });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fabOpen, dispatch]);

  return (
    <div className={`cu-fab-container ${fabOpen ? 'open' : ''}`} ref={fabRef}>
      {fabOpen && (
        <div className="cu-fab-menu">
          {course && (
            <button
              className="cu-fab-item add-to-folder-btn"
              onClick={() => {
                dispatch({ type: 'UI_TOGGLE', payload: { key: 'addToFolderOpen', value: true } });
                dispatch({ type: 'UI_TOGGLE', payload: { key: 'fabOpen', value: false } });
              }}
              aria-label="Add to folder"
            >
              <span className="cu-fab-item-icon">📁</span>
              <span className="cu-fab-item-text">Add to folder</span>
            </button>
          )}
          <button
            className="cu-fab-item switch-healthy-btn"
            onClick={() => {
              switchNow();
              dispatch({ type: 'UI_TOGGLE', payload: { key: 'fabOpen', value: false } });
            }}
            disabled={healthyDomainStatus === 'unreachable'}
            aria-label="Switch domain"
          >
            <span className="cu-fab-item-icon">🌐</span>
            <span className="cu-fab-item-text">Switch domain</span>
          </button>
          <button
            className="cu-fab-item organize-btn"
            onClick={() => {
              dispatch({ type: 'UI_TOGGLE', payload: { key: 'organizerOpen', value: true } });
              dispatch({ type: 'UI_TOGGLE', payload: { key: 'fabOpen', value: false } });
            }}
            aria-label="Organize folders"
          >
            <span className="cu-fab-item-icon">🗂️</span>
            <span className="cu-fab-item-text">Organize folders</span>
          </button>
          <button
            className="cu-fab-item settings-btn"
            onClick={() => {
              dispatch({ type: 'UI_TOGGLE', payload: { key: 'settingsOpen', value: true } });
              dispatch({ type: 'UI_TOGGLE', payload: { key: 'fabOpen', value: false } });
            }}
            aria-label="Settings"
          >
            <span className="cu-fab-item-icon">⚙️</span>
            <span className="cu-fab-item-text">Settings</span>
          </button>
        </div>
      )}
      <button className="cu-fab-trigger" onClick={toggleFab} aria-label={fabOpen ? 'Close menu' : 'Open menu'}>
        <div className="cu-fab-trigger-icon">
          {fabOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="12" cy="5" r="1"></circle>
              <circle cx="12" cy="19" r="1"></circle>
            </svg>
          )}
        </div>
      </button>
    </div>
  );
};
