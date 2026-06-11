import React, { useEffect } from 'react';
import { AppStateProvider, useAppState } from './state/store';
import { useLicense } from './features/license/useLicense';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { registerMenuCommands } from './menu';
import { SyncTriggerProvider } from './features/cookie-sync/SyncTriggerContext';
import { StatusIndicator } from './features/cookie-sync/StatusIndicator';
import { FolderOrganizer } from './features/folder-organizer/FolderOrganizer';
import { AddToFolderModal } from './features/course-organizer/AddToFolderModal';
import { Fab } from './features/fab/Fab';

const AppContent: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { ui } = state;

  // Initialize license validation and monitoring
  useLicense();

  // Connect GM menu commands to React state dispatch
  useEffect(() => {
    registerMenuCommands(dispatch);
  }, [dispatch]);

  return (
    <SyncTriggerProvider>
      {ui.settingsOpen && <SettingsPanel />}
      {ui.organizerOpen && <FolderOrganizer />}
      {ui.addToFolderOpen && <AddToFolderModal />}
      <StatusIndicator />
      <Fab />
    </SyncTriggerProvider>
  );
};

const App: React.FC = () => {
  return (
    <AppStateProvider>
      <div className="cu-host" style={{ display: 'contents' }}>
        <AppContent />
      </div>
    </AppStateProvider>
  );
};

export default App;
