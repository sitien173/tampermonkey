import React, { useState, useEffect } from 'react';
import { useAppState } from '../../state/store';
import { useCourseContext } from '../fab/useCourseContext';
import { useFolders } from '../folder-organizer/useFolders';
import { useAddCourse } from './useAddCourse';
import './index.css';

export const AddToFolderModal: React.FC = () => {
  const { dispatch } = useAppState();
  const courseInfo = useCourseContext();
  const { folders, status } = useFolders();
  const { submit, status: saveStatus } = useAddCourse();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (folders.length > 0 && courseInfo && !initialized) {
      const initial = new Set(
        folders
          .filter((f) =>
            f.courses?.some(
              (c) => c.udemy_course_id === courseInfo.id || c.id === courseInfo.id
            )
          )
          .map((f) => f.id)
      );
      setInitialIds(initial);
      setSelectedIds(new Set(initial));
      setInitialized(true);
    }
  }, [folders, courseInfo, initialized]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!courseInfo) {
    return null;
  }

  const handleClose = () => {
    dispatch({
      type: 'UI_TOGGLE',
      payload: { key: 'addToFolderOpen', value: false },
    });
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleToggleFolder = (folderId: string) => {
    const next = new Set(selectedIds);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setSelectedIds(next);
  };

  // Compare sets to see if selection has changed from initial set
  const isSelectionChanged = () => {
    if (selectedIds.size !== initialIds.size) return true;
    for (const id of selectedIds) {
      if (!initialIds.has(id)) return true;
    }
    return false;
  };

  const handleSave = async () => {
    setError(null);
    const result = await submit(courseInfo.id, Array.from(selectedIds));
    if (result.ok) {
      handleClose();
    } else {
      setError(result.message);
    }
  };

  // Sort folders: default first, then by sort_order
  const sortedFolders = [...folders].sort((a, b) => {
    const aDefault = a.is_default ? 1 : 0;
    const bDefault = b.is_default ? 1 : 0;
    if (aDefault !== bDefault) {
      return bDefault - aDefault;
    }
    return a.sort_order - b.sort_order;
  });

  const isSaveDisabled = !isSelectionChanged() || saveStatus === 'saving';

  return (
    <div className="atf-backdrop" onClick={handleBackdropClick}>
      <div
        className="atf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atf-dialog-title"
      >
        {/* Header */}
        <div className="atf-header">
          <div className="atf-title-section">
            {courseInfo.image ? (
              <img
                src={courseInfo.image}
                alt={courseInfo.title}
                className="atf-thumbnail"
              />
            ) : (
              <div
                className="atf-thumbnail"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--bg-canvas, #0f172a)',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
              </div>
            )}
            <div className="atf-course-info">
              <h3 id="atf-dialog-title" className="atf-course-title">
                {courseInfo.title}
              </h3>
              {courseInfo.instructor && (
                <p className="atf-course-instructor">{courseInfo.instructor}</p>
              )}
            </div>
          </div>
          <button
            className="atf-close-btn"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Error Banner */}
        {error && <div className="atf-error-banner">{error}</div>}

        {/* Body (Folder List) */}
        <div className="atf-body">
          {status === 'loading' && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '24px 0',
              }}
            >
              <div className="atf-spinner-small"></div>
            </div>
          )}

          {status === 'ready' && sortedFolders.length === 0 && (
            <p style={{ color: 'var(--color-text-subdued)', fontSize: '13px' }}>
              No folders created yet.
            </p>
          )}

          {status === 'ready' &&
            sortedFolders.map((folder) => {
              const isChecked = selectedIds.has(folder.id);
              const checkboxId = `atf-checkbox-${folder.id}`;

              return (
                <div
                  key={folder.id}
                  className="atf-folder-item"
                  onClick={() => handleToggleFolder(folder.id)}
                >
                  <input
                    type="checkbox"
                    id={checkboxId}
                    className="atf-checkbox"
                    checked={isChecked}
                    onChange={() => {}} // handled by click container
                  />
                  <span
                    className="atf-folder-dot"
                    style={{
                      backgroundColor:
                        folder.color || 'var(--color-border-subdued, #334155)',
                    }}
                  ></span>
                  <label
                    htmlFor={checkboxId}
                    className="atf-folder-name"
                    onClick={(e) => e.stopPropagation()} // prevent double toggle
                  >
                    {folder.name}
                  </label>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="atf-footer">
          <button className="atf-btn atf-btn-cancel" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="atf-btn atf-btn-save"
            onClick={handleSave}
            disabled={isSaveDisabled}
          >
            {saveStatus === 'saving' && <div className="atf-spinner-small"></div>}
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
