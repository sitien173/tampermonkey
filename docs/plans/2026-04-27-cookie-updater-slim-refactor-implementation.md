# Cookie Updater Slim Refactor Implementation Plan

## Phase Table

| Phase | Owner | Outcome |
| --- | --- | --- |
| 1 | `codex` | Simplify CSS/resources and floating controls without behavior changes |
| 2 | `codex` | Convert organizer popup from image card grid to text-first rows |
| 3 | `codex` | Deduplicate modal/overlay logic and simplify save/settings dialogs |
| 4 | `codex` | Final cleanup, lint/build, and manual smoke checklist |

### Phase 1: Slim visual foundation

**Owner:** `codex`

**Goal:** Remove heavy resources and simplify shared UI styling while preserving current controls and behavior.

**Files:**
- Modify: `src/cookie-updater.js`

**Tasks:**
1. Replace `injectStyles()` CSS with compact system-font styles for notification, controls, popup shell, buttons, modal, folder list, course rows, search, pagination, loading, and empty states.
2. Remove Google font import, blur backdrop, large gradients, heavy shadows, hover expansion, most animations, and base64 placeholder image styling dependencies.
3. Replace floating controls with compact text-first buttons for cookies, folders, save, and settings while keeping `showUiButtons` and `showFolderOrganizer` behavior.
4. Keep existing IDs/classes needed by current JS until later phases update render logic.

**Acceptance Criteria:**
- No external font import remains.
- Floating controls still render and call existing handlers.
- CSS supports existing modal/popup states without visual resource bloat.
- Userscript header and grants unchanged.

**Reviewer Checklist:**
- Confirm `workerUrl`, endpoint strings, storage keys, and auto-login constants are unchanged.
- Confirm no cookie update or auto-login behavior changed.
- Confirm style cleanup does not remove selectors still used by JS.

**Integration Checks:**
- `npm run lint`

### Phase 2: Text-first organizer popup

**Owner:** `codex`

**Goal:** Replace course image card grid with simpler folder/course row organizer.

**Files:**
- Modify: `src/cookie-updater.js`

**Tasks:**
1. Update `createMainPopup()` markup to keep two-column organizer but use compact text-first layout.
2. Update `renderCourseGrid()` into row rendering that displays title, instructor/headline, progress/completed text, Open/Resume, and Remove without thumbnails or image placeholders.
3. Keep search, pagination, all-courses de-duplication, folder-specific loading, open/resume URL behavior, and remove behavior.
4. Keep course image extraction/data fields only for API/local compatibility, but do not render thumbnails.

**Acceptance Criteria:**
- Organizer shows folders and course rows without images.
- Search and pagination still work.
- Open/resume and remove still use existing data flow.
- Empty/loading states still display.

**Reviewer Checklist:**
- Confirm local mode and licensed mode course identifiers remain compatible.
- Confirm all-courses view still de-duplicates courses.
- Confirm `getCourseOpenUrl()` and lesson progress display still work.

**Integration Checks:**
- `npm run lint`

### Phase 3: Simplify modals and dialogs

**Owner:** `codex`

**Goal:** Reduce duplicated overlay/modal code and align create, rename, add-course, and settings dialogs with slim UI.

**Files:**
- Modify: `src/cookie-updater.js`

**Tasks:**
1. Add small shared modal helper for overlay creation, visible state, escape/cancel/overlay close, and cleanup.
2. Refactor create-folder and rename-folder dialogs to use shared helper without changing callback behavior.
3. Refactor add-course dialog to show course title/instructor and folder checkbox/chip list without image preview.
4. Refactor settings dialog markup to remove inline style bloat while preserving license save, toggles, stats, and sync-on-license-change behavior.

**Acceptance Criteria:**
- Create, rename, save-to-folder, and settings dialogs work.
- Add-course dialog has no image preview.
- Overlay cleanup still removes DOM nodes after close.
- License/toggle save behavior remains intact.

**Reviewer Checklist:**
- Confirm modal refactor does not change API calls or folder mutation behavior.
- Confirm loading states still restore button content and disabled state.
- Confirm no unsafe template changes increase injection risk beyond existing behavior.

**Integration Checks:**
- `npm run lint`

### Phase 4: Final cleanup and verification

**Owner:** `codex`

**Goal:** Finish one-file cleanup and run full verification.

**Files:**
- Modify: `src/cookie-updater.js`

**Tasks:**
1. Remove unused icon entries, unused placeholder constants, stale comments made wrong by the refactor, and unused helper code created by earlier phases.
2. Keep menu commands, startup flow, popup observer, current-course save, cookie update, auto-login, and lesson tracking intact.
3. Run formatter if lint/build output requires it; otherwise avoid broad formatting churn.
4. Run full build checks and record manual smoke checklist for browser verification.

**Acceptance Criteria:**
- `src/cookie-updater.js` remains one userscript file.
- No heavy visual resources remain in organizer UI.
- Lint and build pass.
- Manual smoke checklist is ready to execute on Udemy.

**Reviewer Checklist:**
- Confirm no build pipeline or userscript header changes.
- Confirm all design-preserved features still have code paths.
- Confirm cleanup removes only code made unused by this refactor.

**Integration Checks:**
- `npm run lint`
- `npm run build`
- Manual smoke: floating controls, settings save, cookie update, folder popup, create/rename/delete folder, save current course, row display, open/resume, remove, lesson progress.

## Final Integration

After all phases pass, run:

```bash
npm run lint
npm run build
```

Then perform Udemy browser smoke test from the design doc before reporting complete.
