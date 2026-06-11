import React, { useState, useEffect } from 'react';
import { useAppState } from '../../state/store';
import { useFolders } from './useFolders';
import './index.css';

export const FolderOrganizer: React.FC = () => {
  const { dispatch } = useAppState();
  const {
    folders,
    status,
    refresh,
    createFolder,
    updateFolder,
    deleteFolder,
  } = useFolders();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Create folder form state
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#172D2D');

  // Edit folder state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Set default selected folder once folders load
  useEffect(() => {
    if (folders.length > 0 && !selectedId) {
      setSelectedId(folders[0].id);
    }
  }, [folders, selectedId]);

  const handleClose = () => {
    dispatch({
      type: 'UI_TOGGLE',
      payload: { key: 'organizerOpen', value: false },
    });
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName.trim(), newFolderColor);
      setNewFolderName('');
      setIsCreating(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create folder');
    }
  };

  const handleStartRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(currentName);
  };

  const handleSaveRename = async (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    try {
      await updateFolder(id, { name: editName.trim() });
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this folder? All course assignments in this folder will be removed.')) {
      return;
    }
    try {
      await deleteFolder(id);
      if (selectedId === id) {
        setSelectedId(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete folder');
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (draggedId !== id) {
      e.preventDefault();
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const sourceFolder = folders.find(f => f.id === draggedId);
    const targetFolder = folders.find(f => f.id === targetId);
    if (!sourceFolder || !targetFolder) return;

    const sourceOrder = sourceFolder.sort_order;
    const targetOrder = targetFolder.sort_order;

    try {
      await Promise.all([
        updateFolder(sourceFolder.id, { sort_order: targetOrder }),
        updateFolder(targetFolder.id, { sort_order: sourceOrder }),
      ]);
    } catch (err) {
      console.error('Failed to reorder folders:', err);
    } finally {
      setDraggedId(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  // Determine active folder for main view
  const activeFolder = folders.find(f => f.id === selectedId) || folders[0];

  return (
    <div className="organizer-backdrop" onClick={handleBackdropClick}>
      <div className="organizer-modal" role="dialog" aria-modal="true" aria-labelledby="organizer-title">
        {/* Header */}
        <div className="organizer-header">
          <h2 id="organizer-title" className="organizer-title ff-display-sm">Course folder organizer</h2>
          <button className="organizer-close-btn" onClick={handleClose} aria-label="Close organizer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Loading / Error States */}
        {status === 'loading' && (
          <div className="organizer-center-state">
            <div className="ufo-spinner"></div>
            <p className="ff-text-md ff-fg-subdued">Syncing folders from server...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="organizer-center-state">
            <p className="error-text ff-text-md">Failed to load folders from server.</p>
            <button className="retry-btn ff-button-md" onClick={() => refresh()}>Retry</button>
          </div>
        )}

        {status === 'ready' && (
          <div className="organizer-body">
            {/* Sidebar */}
            <div className="organizer-sidebar">
              <div className="sidebar-content">
                <div className="folder-list">
                  {folders.map(folder => {
                    const isActive = activeFolder?.id === folder.id;
                    const isDragging = draggedId === folder.id;
                    const isEditing = editingId === folder.id;

                    return (
                      <div
                        key={folder.id}
                        className={`folder-row ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
                        onClick={() => !isEditing && setSelectedId(folder.id)}
                        draggable={!isEditing}
                        onDragStart={(e) => handleDragStart(e, folder.id)}
                        onDragOver={(e) => handleDragOver(e, folder.id)}
                        onDrop={(e) => handleDrop(e, folder.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="folder-left">
                          <span
                            className="folder-color-dot"
                            style={{ backgroundColor: folder.color || 'var(--color-border-subdued)' }}
                          ></span>
                          
                          {isEditing ? (
                            <form onSubmit={(e) => handleSaveRename(folder.id, e)} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                className="folder-form-input"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                autoFocus
                                onBlur={(e) => handleSaveRename(folder.id, e)}
                              />
                            </form>
                          ) : (
                            <span className="folder-name ff-text-sm ff-fg-default">{folder.name}</span>
                          )}
                        </div>

                        <div className="folder-right">
                          <span className="course-count-badge ff-text-xs">{folder.course_count ?? folder.courses?.length ?? 0}</span>
                          {!isEditing && (
                            <div className="folder-actions">
                              <button
                                className="folder-action-btn"
                                onClick={(e) => handleStartRename(folder.id, folder.name, e)}
                                title="Rename Folder"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                                  <path d="M12 20h9"></path>
                                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                </svg>
                              </button>
                              {!folder.is_default && (
                                <button
                                  className="folder-action-btn"
                                  onClick={(e) => handleDeleteFolder(folder.id, e)}
                                  title="Delete Folder"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar Footer - Add Folder */}
              <div className="sidebar-footer">
                {isCreating ? (
                  <form onSubmit={handleCreateFolder} className="folder-form">
                    <input
                      type="text"
                      className="folder-form-input"
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      autoFocus
                      required
                    />
                    <div className="folder-form-row">
                      <div className="color-picker-wrapper">
                        <label className="form-label ff-label-sm" style={{ fontSize: '12px', margin: 0 }}>Color:</label>
                        <input
                          type="color"
                          className="color-input"
                          value={newFolderColor}
                          onChange={(e) => setNewFolderColor(e.target.value)}
                        />
                      </div>
                      <div className="folder-form-actions">
                        <button type="submit" className="form-btn form-btn-save ff-label-sm">Save</button>
                        <button type="button" className="form-btn form-btn-cancel ff-label-sm" onClick={() => setIsCreating(false)}>Cancel</button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <button className="add-folder-btn ff-label-sm" onClick={() => setIsCreating(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    New folder
                  </button>
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="organizer-main">
              {activeFolder ? (
                <>
                  <div className="main-header">
                    <h3 className="selected-folder-title ff-display-xs">
                      <span
                        className="selected-folder-dot"
                        style={{ backgroundColor: activeFolder.color || 'var(--color-border-subdued)' }}
                      ></span>
                      {activeFolder.name}
                    </h3>
                  </div>

                  <div className="main-content">
                    {activeFolder.courses && activeFolder.courses.length > 0 ? (
                      <div className="course-grid">
                        {activeFolder.courses.map(course => (
                          <a
                            key={course.id}
                            href={course.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="course-card"
                          >
                            <div className="course-thumbnail-wrapper">
                              {course.image_url ? (
                                <img
                                  src={course.image_url}
                                  alt={course.title}
                                  className="course-thumbnail"
                                />
                              ) : (
                                <div className="course-thumbnail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-subdued)' }}>
                                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="course-info">
                              <h4 className="course-title ff-label-sm" title={course.title}>{course.title}</h4>
                              {course.instructor && (
                                <span className="course-instructor ff-text-xs ff-fg-subdued">{course.instructor}</span>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="organizer-center-state">
                        <p className="empty-text ff-text-md">No courses in this folder yet.</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="organizer-center-state">
                  <p className="empty-text ff-text-md">Select a folder to view courses.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
