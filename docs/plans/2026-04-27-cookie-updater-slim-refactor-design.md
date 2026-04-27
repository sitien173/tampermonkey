# Cookie Updater Slim Refactor Design

## Goal

Refactor `src/cookie-updater.js` while keeping it as one userscript file. Preserve cookie update, auto-login, settings, folder sync/local mode, course saving, course open/resume, removal, and lesson progress. Trim the organizer into a lighter text-first UI and remove heavy visual resources.

## Architecture

The file stays single-source to avoid build changes and userscript bundling risk. Refactor it into clear internal sections:

1. Config, storage, and shared state.
2. API helpers for worker, cookies, folders, and courses.
3. Cookie engine for fetch, remove, apply, reload flow.
4. Course data extraction and progress helpers.
5. Light organizer UI for floating controls, popup, folders, course rows, modals, settings.
6. Startup and event wiring.

Do not change the userscript header, grants, `workerUrl`, endpoint names, storage keys, auto-login guard limits, or Gulp build pipeline.

## UI Design

Organizer becomes a utility panel instead of a mini app.

Floating controls remain bottom-right with compact buttons: Cookies, Folders, Save, Settings. Use plain text or tiny symbols. Remove expanding hover labels, gradient buttons, large SVG icon library, Google font import, blur backdrop, heavy shadows, animation bloat, base64 placeholder image, and course thumbnails.

Main popup layout:

- Left column: folders, course counts, New button, rename/delete actions.
- Right column: search input, course rows, pagination if needed.
- Course row: title, instructor/headline, progress/completed text if present, Open/Resume button, Remove button.
- Add-course modal: folder checkbox/chip list, no course preview image.
- Settings modal: license, toggles, stats.

CSS should remain comprehensive but compact: overlay, popup, buttons, modal, folders, rows, search, empty/loading states, pagination, and responsive narrow viewport behavior.

## Data Flow

Startup loads config, attempts auto-login, syncs folders when license exists, otherwise loads local folders. Cookie update still fetches worker cookies, removes existing cookies, applies new cookies, and reloads after success. Folder actions still use server APIs with a license and local data without a license. Lesson progress still watches lesson URLs and saves `last_lesson_url`.

Course image extraction may remain in data collection because the API/local schema already accepts it, but organizer display should not render thumbnails.

## Refactor Boundaries

- Preserve `GM_cookie` behavior and `document.cookie` fallback.
- Preserve `GM_registerMenuCommand` entries.
- Preserve `showUiButtons` and `showFolderOrganizer` settings.
- Keep course hover popup save injection only if it can be simplified safely; otherwise prioritize current course-page save and folder popup reliability.
- Deduplicate modal creation and overlay cleanup where practical.
- Avoid broad behavior rewrites outside UI/CSS cleanup and local helper simplification.

## Verification

Run:

```bash
npm run lint
npm run build
```

Manual browser smoke on Udemy:

- Floating controls render.
- Settings saves license and toggles.
- Cookie update starts and reports result.
- Folder popup opens.
- Create, rename, and delete folder work.
- Save current course opens folder picker.
- Saved course appears as text row.
- Open/resume works.
- Remove course works.
- Lesson progress still updates.
