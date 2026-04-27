# Userscript New API Refactor — Implementation Plan

> **Design:** `docs/plans/2026-04-27-userscript-new-api-design.md`

## Phase Table

| Phase | Owner | Outcome |
|---|---|---|
| 1 | codex | Add safe Udemy token detection and request-header support |
| 2 | codex | Refactor server-mode course save to new backend contract |
| 3 | codex | Cleanup, verification, and regression checks |

---

### Phase 1: Token detection and API helper foundation

**Owner:** `codex`

**Goal:** Add reusable request-header support and an ephemeral Udemy token detector without changing existing backend call behavior yet.

**Files:**
- Modify: `src/cookie-updater.js`

**Tasks:**
1. Change `apiRequest(method, endpoint, body = null)` to accept optional `extraHeaders = {}` and merge them into existing request headers after default headers.
2. Add `getUdemyAccessToken()` that inspects `localStorage` and `sessionStorage`, parses direct and JSON/nested values for `access_token`, and returns a plausible token string or `null`.
3. Add small helper logic for safe nested token lookup without logging, storing, or displaying token values.
4. Ensure no existing API call behavior changes when `extraHeaders` is omitted.

**Acceptance Criteria:**
- Existing calls to `/api/sync`, folder CRUD, progress save, cookie fetch, and public config still use same default headers.
- `getUdemyAccessToken()` does not call `GM_setValue`, does not write to `config`, and does not log token content.
- Token detection runs only when called; it is not invoked during startup/sync/folder browsing.

**Reviewer Checklist:**
- No token is persisted in Tampermonkey storage or local config.
- No token value can appear in console logs or notifications.
- Header merge cannot remove `X-License-Key`, `X-Device-Id`, or `X-API-Key` from normal requests.

**Integration Checks:**
- `npm run lint`

---

### Phase 2: Server-mode course save contract refactor

**Owner:** `codex`

**Goal:** Update server-mode course saving to send only course id and folder ids to the new backend route with a per-request Udemy bearer token.

**Files:**
- Modify: `src/cookie-updater.js`

**Tasks:**
1. Update server-mode `addCourseToFoldersAPI(folderIds, courseInfo)` to call `getUdemyAccessToken()` before any backend write.
2. If token is missing, throw or surface a friendly error so the modal shows `Udemy access token not found. Refresh/login to Udemy and try again.` and no backend request is sent.
3. Replace old route and payload with `POST /api/courses/multi-folder` and body `{ course_id: courseInfo.id, folder_ids: folderIds }`.
4. Pass `Authorization: Bearer <token>` via `apiRequest` extra headers, then run existing sync refresh after success.

**Acceptance Criteria:**
- Server-mode save no longer sends `title`, `url`, `image_url`, or `instructor` in request body.
- Server-mode save uses `/api/courses/multi-folder`, not `/api/courses/add-to-folders`.
- Missing token stops before backend request.
- Local mode course save remains unchanged and still uses DOM metadata.
- Course preview modal remains unchanged visually.

**Reviewer Checklist:**
- Backend trusted metadata flow is respected: DOM metadata is UI/local-only.
- Udemy token appears only in `Authorization` request header.
- Existing update/delete flows continue using synced `course_id` values.
- `syncFoldersFromServer()` still runs after successful server save.

**Integration Checks:**
- `npm run lint`
- `npm run build`

---

### Phase 3: Cleanup, error mapping, and regression hardening

**Owner:** `codex`

**Goal:** Polish new error behavior, remove stale naming/comments, and verify build/lint plus route/payload safety.

**Files:**
- Modify: `src/cookie-updater.js` (only for cleanup/fixes found during verification)

**Tasks:**
1. Map course-save failures to user-friendly notifications: missing token, 401 expired session, 404 unavailable course, 429 rate limit, 502 metadata service unavailable, and generic fallback.
2. Remove or update stale comments/names that describe `courseInfo.id` as a slug when used as Udemy course id for backend save.
3. Grep/review for old route and old server payload metadata fields in server-mode save path.
4. Run final lint/build and record manual browser verification steps.

**Acceptance Criteria:**
- Missing token notification is exact: `Udemy access token not found. Refresh/login to Udemy and try again.`
- Backend 401/404/429/502 have clear user-facing messages.
- No old server-mode route `/api/courses/add-to-folders` remains.
- No server-mode request body includes `title`, `url`, `image_url`, or `instructor`.
- Token is never logged, persisted, or included in request body.

**Reviewer Checklist:**
- No broad UI redesign or build pipeline changes.
- Folder CRUD, sync, cookie update, lesson progress, and local mode are not regressed by the refactor.
- Build output still preserves userscript header via existing pipeline.
- Manual testing notes cover successful save and missing-token path.

**Integration Checks:**
- `npm run lint`
- `npm run build`
- `grep -R "/api/courses/add-to-folders\|image_url\|instructor\|Authorization" --include="*.js" F:/projects/udemy/tampermonkey/src` (review output manually; preview/local metadata and Authorization header use are allowed, old server route is not)

---

## Final Integration

After all phases pass:

- `npm run lint`
- `npm run build`
- Manual Udemy course page save with license key configured:
  - modal still shows DOM-derived preview
  - network request is `POST /api/courses/multi-folder`
  - request body contains only `course_id` and `folder_ids`
  - request has `Authorization: Bearer ...`
  - `/api/sync` reloads trusted backend metadata after save
- Manual missing-token simulation:
  - token helper returns `null`
  - notification says `Udemy access token not found. Refresh/login to Udemy and try again.`
  - no backend course-save request is sent
- Regression checks:
  - folder create/update/delete still works
  - saved course update/delete still uses synced backend `course_id`
  - local mode still saves DOM metadata
  - no Udemy token appears in config, logs, request body, or userscript storage
