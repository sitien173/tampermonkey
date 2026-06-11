import { Action } from './state/types';

// Queue to hold clicks before React is ready
const clickQueue: Array<'settings' | 'organize'> = [];
let activeDispatch: React.Dispatch<Action> | null = null;

// Synchronously register the actual GM menu commands when the script loads
if (typeof GM_registerMenuCommand !== 'undefined') {
  GM_registerMenuCommand('Cookie Updater — Settings', () => {
    if (activeDispatch) {
      activeDispatch({ type: 'UI_TOGGLE', payload: { key: 'settingsOpen', value: true } });
    } else {
      clickQueue.push('settings');
    }
  });

  GM_registerMenuCommand('Cookie Updater — Organize Folders', () => {
    if (activeDispatch) {
      activeDispatch({ type: 'UI_TOGGLE', payload: { key: 'organizerOpen', value: true } });
    } else {
      clickQueue.push('organize');
    }
  });
}

/**
 * Connects the React state dispatch to the GM menu commands.
 * Processes any clicks that occurred before the React app booted.
 */
export function registerMenuCommands(dispatch: React.Dispatch<Action>): void {
  activeDispatch = dispatch;
  
  // Process any buffered clicks
  while (clickQueue.length > 0) {
    const cmd = clickQueue.shift();
    if (cmd === 'settings') {
      dispatch({ type: 'UI_TOGGLE', payload: { key: 'settingsOpen', value: true } });
    } else if (cmd === 'organize') {
      dispatch({ type: 'UI_TOGGLE', payload: { key: 'organizerOpen', value: true } });
    }
  }
}
