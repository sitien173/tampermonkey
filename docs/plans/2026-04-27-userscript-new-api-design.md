# Userscript New API Refactor — Design

## Goal

Refactor the Udemy Tampermonkey userscript so server-mode course saving matches the new backend API design. The userscript should stop sending trusted course metadata to the backend. It should send only the Udemy course id plus a per-request Udemy bearer token. The backend fetches and stores trusted metadata.

Local mode remains unchanged because it has no backend metadata fetch.

## Decisions

| Area | Decision |
|---|---|
| Refactor scope | Full cleanup inside existing userscript file |
| Backend payload | Send only `course_id` and `folder_ids` for server-mode multi-folder save |
| UI preview | Keep DOM-extracted title/image/instructor/url for modal preview only |
| Metadata trust | Server metadata comes from backend Udemy fetch, not userscript DOM extraction |
| Token source | Auto-detect Udemy access token at save time |
| Token fallback | If token missing, show error and do not call backend |
| Token storage | Never persist Udemy token in userscript config/storage |
| Route | Use `POST /api/courses/multi-folder` |
| Local mode | Keep DOM metadata save behavior unchanged |

## Architecture

Keep the current build pipeline and single source file shape. Refactor `src/cookie-updater.js` in place rather than adding new build artifacts.

Main internal cleanup:

1. Keep `apiRequest()` as shared backend helper, but extend it to accept optional `extraHeaders`:

```js
apiRequest(method, endpoint, body = null, extraHeaders = {})
```

2. Add `getUdemyAccessToken()` helper that detects the current Udemy session token when the user clicks Save.

3. Keep `getCurrentCourseInfo()` for UI/local mode only. It may still read title, image, instructor, and URL from DOM for preview and local-mode saved data.

4. Change server-mode `addCourseToFoldersAPI()` to send only:

```json
{
  "course_id": "123456",
  "folder_ids": ["folder-guid-1", "folder-guid-2"]
}
```

with:

```http
Authorization: Bearer <udemy_access_token>
```

5. After save succeeds, call `syncFoldersFromServer()` so displayed metadata is reloaded from backend-trusted data.

## Token Detection

`getUdemyAccessToken()` should run only for server-mode course save. It must not run during page load, sync, folder browsing, cookie update, or lesson progress tracking.

Detection order:

1. Inspect `localStorage` and `sessionStorage` for known/direct token values.
2. Parse JSON values that may contain `access_token`.
3. Traverse nested session/auth objects conservatively for an access token.
4. Validate minimally:
   - non-empty string
   - not a full JSON blob
   - plausible token length

The token is returned to the caller only. It must not be logged, shown in UI, saved to `GM_setValue`, or included in request body.

If token cannot be detected, show:

```text
Udemy access token not found. Refresh/login to Udemy and try again.
```

and do not send a backend request.

## Server-Mode Course Save Flow

1. User opens Save Course modal from a Udemy course page.
2. Userscript extracts course information from DOM for preview.
3. User selects one or more folders.
4. On Save, userscript detects Udemy access token.
5. If token missing, show missing-token notification and stop.
6. If token exists, call `POST /api/courses/multi-folder` with only `course_id` and `folder_ids`.
7. Add `Authorization: Bearer <token>` as request header.
8. Backend fetches Udemy metadata, writes database records, and returns existing response shape.
9. Userscript calls `/api/sync` and refreshes local folder UI.

## Route Contract

Replace old server-mode payload and route:

```js
POST /api/courses/add-to-folders
{
  folder_ids,
  course_id,
  title,
  url,
  image_url,
  instructor
}
```

with:

```js
POST /api/courses/multi-folder
{
  course_id,
  folder_ids
}
```

Response contract remains backend-owned:

- response `course_id` is backend DB course GUID
- `folder_course_ids` are join-row GUIDs
- `/api/sync` `course_id` remains backend DB course GUID
- `/api/sync` `udemy_course_id` remains Udemy id

Update/delete course flows should continue using synced backend `course_id` in server mode.

## Error Handling

Course save should map failures to clear notifications:

| Case | Userscript behavior |
|---|---|
| No selected folder | Existing modal behavior |
| No license key | Existing local mode behavior |
| No Udemy token | `Udemy access token not found. Refresh/login to Udemy and try again.` |
| Backend 401 | `Udemy session expired. Refresh/login to Udemy and try again.` |
| Backend 404 | `Udemy course not found or unavailable.` |
| Backend 429 | `Udemy rate limit hit. Try again later.` |
| Backend 502 | `Udemy metadata service unavailable. Try again later.` |
| Other failure | Existing generic save failure path |

No token may appear in console logs, notifications, config, request body, or userscript storage.

## Non-Goals

- No manual token settings field.
- No token persistence.
- No backend compatibility shim for old course metadata payload.
- No UI redesign beyond messages needed for new flow.
- No change to cookie update behavior.
- No change to folder CRUD behavior.
- No change to lesson progress tracking unless route mismatch is discovered during implementation.

## Verification

Required checks:

- `npm run lint`
- `npm run build`
- Manual course save on Udemy page:
  - modal still shows preview
  - request route is `/api/courses/multi-folder`
  - request body contains only `course_id` and `folder_ids`
  - request has `Authorization: Bearer ...`
  - no token appears in console or storage
  - sync reloads folder data after success
- Missing-token simulation:
  - token helper returns null
  - missing-token notification appears
  - no backend request is sent
- Regression checks:
  - folder CRUD still works
  - delete/update saved course still uses synced backend `course_id`
  - local mode still saves DOM metadata
