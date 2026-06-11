import React, { createContext, useContext } from 'react';
import { useCookieSync } from './useCookieSync';

export interface SyncTriggerContextValue {
  triggerSync: () => Promise<void>;
}

const SyncTriggerContext = createContext<SyncTriggerContextValue | null>(null);

export const SyncTriggerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { triggerSync } = useCookieSync();
  return (
    <SyncTriggerContext.Provider value={{ triggerSync }}>
      {children}
    </SyncTriggerContext.Provider>
  );
};

export function useSyncTrigger(): SyncTriggerContextValue {
  const context = useContext(SyncTriggerContext);
  if (!context) {
    throw new Error('useSyncTrigger must be used within a SyncTriggerProvider');
  }
  return context;
}
