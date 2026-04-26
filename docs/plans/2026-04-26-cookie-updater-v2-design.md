# Cookie Updater V2 Design

## Scope and Architecture

`src/cookie-updater-v2.js` is a separate userscript, not a replacement for the existing script. The header keeps Udemy matching, `GM_setValue`, `GM_getValue`, `GM_cookie`, `GM_xmlhttpRequest`, `GM_registerMenuCommand`, the same worker `@connect`, and `@run-at document-start`. The description becomes cookie sync only, with an independent V2 version.

Core modules remain small:

- Config: `licenseKey`, `apiKey`, `retryAttempts`, `autoRun`.
- Device ID: persisted Tampermonkey value using the existing random-ID approach.
- Worker fetch: GET `workerUrl?key=...&device=...`, parse cookie array, surface invalid key and worker errors.
- Cookie apply: list current cookies, delete old cookies for the current URL/domain, save fetched cookies through `GM_cookie.set`.
- UI: tiny fixed overlay with status text, license input, save button, retry button, and run-now control.
- Menu commands: set license, run sync now, toggle auto-run.

Removed completely: folders, course CRUD, course popup observer, lesson progress, folder sync endpoints, course DOM scraping, organizer modal, and all related CSS/icons/state.

Startup flow renders the overlay early, loads config, registers menu commands, then runs sync only when a license exists and `autoRun` is enabled. If no license exists, the overlay asks for the key and stops. On successful cookie save, the script reloads after a short delay.

## Data Flow and Loading Behavior

V2 optimizes first-load path around one job: get valid Udemy cookies in place as early as possible.

1. Script starts at `document-start`.
2. It loads saved config from Tampermonkey storage.
3. It renders a tiny overlay immediately, using `document.documentElement` or waiting until `document.body` exists if needed.
4. If no license key exists, the overlay shows “License required”, an input, and Save button. No worker call is made.
5. If a license key exists, the overlay shows “Fetching cookies…” and calls the worker with license and device ID.
6. Worker response is parsed as a cookie array. Empty or bad response becomes a visible overlay error.
7. Script filters cookies for the current Udemy host/domain.
8. It removes existing cookies for the current URL using `GM_cookie.list` and `GM_cookie.delete`.
9. It saves new cookies with `GM_cookie.set`.
10. If one or more cookies save, overlay shows success and reloads after roughly 800–1000ms.

“Best time loading” means aggressive early start with minimal page work. No course scanning. No modal injection. No large CSS. No MutationObserver except an optional body-ready helper. Overlay states are `need-license`, `fetching`, `applying`, `success`, and `error`. Retry appears on error. Saving a license triggers immediate sync. Menu “Run Cookie Sync Now” calls the same sync function. `isSyncing` prevents double fetches from overlay and menu.

## Errors, UI, and Testing

Worker or network failures show an overlay error with retry. Invalid license shows “Invalid license key” and keeps the input visible. Empty cookie array shows warning and does not reload. Partial cookie failures show saved and failed counts. Reload happens only when `savedCount > 0`. If `GM_cookie` is unavailable, the script reports that Tampermonkey cookie permission is required because reliable saving of session or HttpOnly cookies needs `GM_cookie`.

UI is a compact top-right pill/card with high z-index, dark background, and white text. It contains a status line, license input, Save, Retry, and Run now controls. It can collapse after success, but stays visible during license and error states. CSS stays inline in one injected `<style>` block. No icons are needed.

Testing:

- Run `npm run lint`.
- Run `npm run build`.
- Manually install generated V2 userscript from `dist/` or source in Tampermonkey.
- Test no-license path.
- Test save-license path.
- Test successful fetch/apply/reload.
- Test invalid license.
- Test network error and retry.
- Test retry while sync is already running.
- Confirm old `cookie-updater.js` still builds unchanged.
- Confirm new V2 userscript header is preserved by Gulp.
- If build pipeline only includes known source files, update Gulp to emit V2. If it already builds all `src/*.js`, no build change is needed.
