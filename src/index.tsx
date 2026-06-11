import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './menu';
import './styles/index.css';

/**
 * Wait for document.body to be available.
 * @run-at document-start means we might execute before body exists.
 */
function waitForBody(): Promise<HTMLElement> {
  return new Promise(resolve => {
    if (document.body) {
      resolve(document.body);
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        resolve(document.body);
      }
    });
    observer.observe(document.documentElement, { childList: true });
  });
}

/**
 * Boot the React application inside a closed Shadow DOM.
 */
async function boot() {
  // 1. Register menu commands synchronously (Stub for Phase 2)
  // GM_registerMenuCommand will be called here in future phases.

  // 2. Wait for document.body
  const body = await waitForBody();

  // 3. Create root element and attach Shadow DOM
  const rootDiv = document.createElement('div');
  rootDiv.id = 'cu-root';
  body.appendChild(rootDiv);

  const shadowRoot = rootDiv.attachShadow({ mode: 'closed' });

  // 4. Inject compiled CSS from bundlePlugin
  const style = document.createElement('style');
  style.textContent = (window as any).__CU_CSS__ || '';
  shadowRoot.appendChild(style);

  // 5. Render React application
  const root = createRoot(shadowRoot);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // 6. Styled console log
  console.log("%cCookie Updater v3.1.6", "color: #a855f7; font-weight: bold");
}

// Start the boot sequence
boot().catch(err => {
  console.error('Failed to boot Cookie Updater:', err);
});
