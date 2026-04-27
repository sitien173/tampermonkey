# Taplai Keyboard Shortcuts — Design

**Date:** 2026-04-04  
**Target URL:** `https://taplai.com/pham-mem-thi-thu-mo-phong-120-tinh-huong-giao-thong.html`  
**Output file:** `src/taplai-keyboard-shortcuts.js`

---

## 1. Script Structure

- New standalone file: `src/taplai-keyboard-shortcuts.js`
- Follows same IIFE + `'use strict'` pattern as `cookie-updater.js`
- `@grant none` — pure DOM + native Fullscreen API
- `@run-at document-idle` — DOM must be ready before attaching listener

### UserScript Header

```
// ==UserScript==
// @name         Taplai Keyboard Shortcuts
// @description  Keyboard shortcuts for taplai.com traffic simulation quiz
// @namespace    https://greasyfork.org/users/1508709
// @version      1.0.0
// @author       https://github.com/sitien173
// @match        https://taplai.com/pham-mem-thi-thu-mo-phong-120-tinh-huong-giao-thong.html
// @grant        none
// @run-at       document-idle
// @downloadURL  https://pub-34da56ee366741478de3aa5bf175e13e.r2.dev/taplai-keyboard-shortcuts.user.js
// @updateURL    https://pub-34da56ee366741478de3aa5bf175e13e.r2.dev/taplai-keyboard-shortcuts.meta.js
// @source       https://github.com/sitien173/tampermonkey
// ==/UserScript==
```

---

## 2. Key Binding Map

| Key | Action | Selector |
|-----|--------|----------|
| `Space` | Show score/answer | `#spaceButton` |
| `Enter` | Play / Pause | `#playPauseButton` |
| `←` | Previous video | `#previousButton` |
| `→` | Next video | `#nextButton` |
| `R` / `r` | Replay video | `#rewindButton` |
| `H` / `h` | Hint (Gợi Ý) | `#hintButton` |
| `G` / `g` | Toggle guide (Tắt/Bật hướng dẫn) | `#toggleGuideButton` |
| `F` / `f` | Toggle fullscreen | `#videoContainer` (Fullscreen API) |

---

## 3. Key Handler Logic

- Single `keydown` listener attached to `document`
- **Input guard:** if `event.target` is `INPUT`, `TEXTAREA`, `SELECT`, or `[contenteditable]` → return early
- `event.preventDefault()` called for: `Space`, `Enter`, `ArrowLeft`, `ArrowRight` (prevents scroll/submit)
- All other keys (`R`, `H`, `G`, `F`) do not need `preventDefault()`
- Dispatch: `document.querySelector(selector)?.click()` for all mapped buttons
- `F` key handled separately via `toggleFullscreen()` function

```js
const KEY_MAP = {
  ' ':           '#spaceButton',
  'Enter':       '#playPauseButton',
  'ArrowLeft':   '#previousButton',
  'ArrowRight':  '#nextButton',
  'r':           '#rewindButton',
  'h':           '#hintButton',
  'g':           '#toggleGuideButton',
};
```

---

## 4. Fullscreen Toggle

Uses native Fullscreen API on `#videoContainer`:

```js
function toggleFullscreen() {
  const container = document.querySelector('#videoContainer');
  if (!container) return;
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}
```

- No webkit fallback needed (Chrome/Firefox/Edge only)
- Errors silently swallowed
- State read from `document.fullscreenElement` — no manual boolean flag

---

## 5. Build Integration

- Add `taplai-keyboard-shortcuts` as a new entry in `gulpfile.cjs` alongside `cookie-updater`
- CI will build and deploy `dist/taplai-keyboard-shortcuts.user.js` and `.meta.js` to R2

---

## Acceptance Criteria

- [ ] All 8 key bindings trigger the correct button click
- [ ] Shortcuts suppressed when focus is in input/textarea/select/contenteditable
- [ ] `F` toggles fullscreen on `#videoContainer` using native API
- [ ] `Space`, `Enter`, arrow keys call `preventDefault()`
- [ ] `npm run build` succeeds with no errors
- [ ] `npm run lint` passes with no errors
