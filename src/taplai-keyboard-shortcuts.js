// ==UserScript==
// @name         Taplai Keyboard Shortcuts
// @description  Keyboard shortcuts for taplai.com traffic simulation quiz
// @namespace    https://greasyfork.org/users/1508709
// @version      1.4.0
// @author       https://github.com/sitien173
// @match        https://taplai.com/pham-mem-thi-thu-mo-phong-120-tinh-huong-giao-thong.html
// @grant        none
// @run-at       document-idle
// @downloadURL  https://pub-34da56ee366741478de3aa5bf175e13e.r2.dev/taplai-keyboard-shortcuts.user.js
// @updateURL    https://pub-34da56ee366741478de3aa5bf175e13e.r2.dev/taplai-keyboard-shortcuts.meta.js
// @source       https://github.com/sitien173/tampermonkey
// ==/UserScript==
(function () {
  'use strict';

  const KEY_MAP = {
    ' ': '#spaceButton',
    Enter: '#playPauseButton',
    ArrowLeft: '#previousButton',
    ArrowRight: '#nextButton',
    r: '#rewindButton',
    h: '#hintButton',
    g: '#toggleGuideButton',
  };
  const PREVENT_DEFAULT_KEYS = new Set([' ', 'Enter', 'ArrowLeft', 'ArrowRight']);
  const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

  let overlay;
  let overlayTimer = null;
  let keymapOverlay;
  let statusOverlay;

  function initOverlay() {
    const container = document.querySelector('#videoContainer');
    const scoreDisplay = document.querySelector('#scoreDisplay');

    if (!container || !scoreDisplay) return;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    overlay = document.createElement('div');
    overlay.id = 'taplai-score-overlay';

    Object.assign(overlay.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '1.5rem',
      fontWeight: 'bold',
      zIndex: '9999',
    });

    overlay.innerHTML = scoreDisplay.innerHTML;
    container.appendChild(overlay);

    const observer = new MutationObserver(() => {
      overlay.innerHTML = scoreDisplay.innerHTML;
    });

    observer.observe(scoreDisplay, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function initKeymapOverlay() {
    keymapOverlay = document.createElement('div');
    keymapOverlay.id = 'taplai-keymap-overlay';

    Object.assign(keymapOverlay.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      padding: '12px',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      color: 'white',
      fontSize: '12px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      borderRadius: '8px',
      zIndex: '10000',
      display: 'none',
      pointerEvents: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255,255,255,0.1)',
    });

    const shortcuts = [
      { key: 'Space', desc: 'Show score/answer' },
      { key: 'Enter', desc: 'Play/Pause' },
      { key: '←', desc: 'Previous' },
      { key: '→', desc: 'Next' },
      { key: 'R', desc: 'Rewind' },
      { key: 'H', desc: 'Hint' },
      { key: 'G', desc: 'Toggle guide' },
      { key: 'F', desc: 'Fullscreen' },
      { key: 'K', desc: 'Toggle status' },
      { key: '~', desc: 'Toggle help' },
    ];

    keymapOverlay.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">Keyboard Shortcuts</div>
      <table style="border-collapse: collapse; width: 100%;">
        ${shortcuts
          .map(
            (s) => `
          <tr>
            <td style="padding: 2px 12px 2px 0; font-weight: bold; color: #aaa; white-space: nowrap;">${s.key}</td>
            <td style="padding: 2px 0; white-space: nowrap;">${s.desc}</td>
          </tr>
        `
          )
          .join('')}
      </table>
    `;

    document.body.appendChild(keymapOverlay);
  }

  function initStatusOverlay() {
    statusOverlay = document.createElement('div');
    statusOverlay.id = 'taplai-status-overlay';
    Object.assign(statusOverlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '200px',
      height: '50px',
      backgroundColor: 'black',
      color: 'white',
      fontSize: '14px',
      fontWeight: 'bold',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10001',
      pointerEvents: 'none',
    });
    statusOverlay.textContent = 'Keyboard Active';
    document.body.appendChild(statusOverlay);
  }

  function toggleKeymapOverlay() {
    if (!keymapOverlay) return;
    keymapOverlay.style.display = keymapOverlay.style.display === 'none' ? 'block' : 'none';
  }

  function toggleStatusOverlay() {
    if (!statusOverlay) return;
    statusOverlay.style.display = statusOverlay.style.display === 'none' ? 'flex' : 'none';
  }

  function hideOverlay() {
    if (overlayTimer !== null) {
      clearTimeout(overlayTimer);
      overlayTimer = null;
    }
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  function showOverlay() {
    if (!overlay) return;
    overlay.style.display = 'flex';
    if (overlayTimer !== null) clearTimeout(overlayTimer);
    overlayTimer = setTimeout(hideOverlay, 3000);
  }

  function toggleFullscreen() {
    const container = document.querySelector('#videoContainer');
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  function isEditableTarget(target) {
    return Boolean(target) && (INPUT_TAGS.has(target.tagName) || target.isContentEditable);
  }

  function getSelectorForKey(key) {
    if (key === 'r' || key === 'R' || key === 'h' || key === 'H' || key === 'g' || key === 'G') {
      return KEY_MAP[key.toLowerCase()];
    }

    return KEY_MAP[key];
  }

  document.addEventListener('keydown', (event) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (event.key === '~') {
      toggleKeymapOverlay();
      return;
    }

    if (event.key === 'k' || event.key === 'K') {
      toggleStatusOverlay();
      return;
    }

    if (event.key === 'f' || event.key === 'F') {
      toggleFullscreen();
      return;
    }

    const selector = getSelectorForKey(event.key);
    if (!selector) {
      return;
    }

    if (PREVENT_DEFAULT_KEYS.has(event.key)) {
      event.preventDefault();
    }

    document.querySelector(selector)?.click();

    if (event.key === ' ') {
      showOverlay();
    } else if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'r' ||
      event.key === 'R'
    ) {
      hideOverlay();
    }
  });

  initOverlay();
  initKeymapOverlay();
  initStatusOverlay();
})();
