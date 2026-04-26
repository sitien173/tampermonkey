# Cookie Updater V2 Implementation Plan

## Phase Table

| Phase | Owner | Outcome |
|---|---|---|
| 1 | `codex` | Create clean-room V2 cookie sync userscript |
| 2 | `codex` | Wire build pipeline and verify V2 output |

### Phase 1: Create minimal V2 userscript

**Owner:** `codex`

**Goal:** Add `src/cookie-updater-v2.js` as a standalone, minimal Udemy cookie sync userscript based on the approved design.

**Files:**
- Create: `src/cookie-updater-v2.js`

**Tasks:**
1. Add userscript header with Udemy match, required GM grants, worker connect, `document-start`, and V2-specific metadata.
2. Implement config storage, device ID creation, menu commands, and guarded `runCookieSync` startup flow.
3. Implement worker cookie fetch, response validation, domain filtering, current-cookie delete, new-cookie save, partial-failure counting, and success-triggered reload.
4. Implement compact overlay with license input, save, retry, run-now, and states for need-license, fetching, applying, success, and error.

**Acceptance Criteria:**
- `src/cookie-updater-v2.js` exists and does not import or copy course organizer CRUD, lesson tracking, folder sync, course popup observer, or organizer modal logic.
- Missing license shows overlay input and makes no worker request.
- Existing license auto-runs at `document-start` and reloads only after at least one cookie saves.
- Worker, invalid-license, empty-cookie, missing-`GM_cookie`, and partial-save failures surface in overlay without reload unless at least one cookie saved.
- Menu commands support setting license, running sync now, and toggling auto-run.

**Reviewer Checklist:**
- Verify V2 script is standalone and old `src/cookie-updater.js` remains unchanged.
- Verify `isSyncing` prevents duplicate overlay/menu sync runs.
- Verify cookie filtering matches current Udemy host/domain and save/delete paths use `GM_cookie`.
- Verify overlay works before full DOM readiness and keeps UI minimal.

**Integration Checks:**
- `npm run lint`
- Manual source review for absence of course organizer terms in `src/cookie-updater-v2.js`: `folder`, `course`, `lesson`, `organizer` should not appear except if unavoidable in metadata or comments.

### Phase 2: Wire build and verify output

**Owner:** `codex`

**Goal:** Ensure V2 is included in existing Gulp build outputs with preserved userscript headers and no regression to existing scripts.

**Files:**
- Modify: `gulpfile.cjs`
- Verify: `dist/`

**Tasks:**
1. Add `cookie-updater-v2` to the Gulp script list so lint, dev, build, meta, format, and watch include it.
2. Run lint/build and fix issues in V2 or build config only.
3. Confirm `dist/cookie-updater-v2.user.js` and `dist/cookie-updater-v2.meta.js` are generated with preserved userscript headers.
4. Confirm existing `cookie-updater.user.js` and `taplai-keyboard-shortcuts.user.js` still build.

**Acceptance Criteria:**
- `gulpfile.cjs` includes `cookie-updater-v2` in `config.scripts`.
- `npm run lint` passes.
- `npm run build` passes.
- `dist/cookie-updater-v2.user.js` and `dist/cookie-updater-v2.meta.js` are generated.
- V2 dist header contains expected `@name`, `@grant`, `@connect`, `@run-at`, `@downloadURL`, and `@updateURL` lines.

**Reviewer Checklist:**
- Verify build config change is minimal and does not switch to broad glob behavior unexpectedly.
- Verify header extraction/prepend behavior works for V2 output.
- Verify production minification does not break inline CSS or overlay string templates.
- Verify existing two scripts still appear in dist after clean build.

**Integration Checks:**
- `npm run lint`
- `npm run build`
- Check generated files exist in `dist/`: `cookie-updater-v2.user.js`, `cookie-updater-v2.meta.js`, `cookie-updater.user.js`, `taplai-keyboard-shortcuts.user.js`

## Final Integration

Run after both phases pass:

- `npm run lint`
- `npm run build`
- Manually install V2 userscript from `dist/cookie-updater-v2.user.js` or source.
- Manual browser checks:
  - no-license path shows license input and makes no sync call
  - save-license triggers sync
  - successful cookie fetch/apply reloads once
  - invalid license shows error and keeps input visible
  - network error shows retry
  - run-now while syncing does not duplicate work
