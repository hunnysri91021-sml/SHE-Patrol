# SHE Patrol — notes for whoever (human or Claude) works on this next

Stack: static `index.html` (hosted on GitHub Pages) talking to a Google Apps
Script Web App (`SHE-Patrol-AppsScript.gs`) backed by Google Sheets (Findings /
Users / Settings tabs). No build step, no framework — plain JS in one file.

## Deploying a `.gs` change — do not skip this

The Apps Script project is a **copy-pasted** Google Sheet script, not connected
to this git repo. After editing `SHE-Patrol-AppsScript.gs` here, someone with
access to the live Google Sheet must manually:
1. Extensions → Apps Script → select all, delete, paste the new file content
   (use the GitHub "Raw" view to copy cleanly).
2. Deploy → Manage deployments → edit the **existing** Web app deployment →
   Version: **New version** → Deploy. (A brand-new deployment gets a new URL
   and breaks `index.html`'s hardcoded `APP_CONFIG.API_URL` — always reuse the
   existing one.)
3. If the change added Settings keys (`DEFAULT_SETTINGS`), also re-run
   **"SHE Patrol" → "ตั้งค่าชีต (Setup)"** from the Sheet's own menu (not the
   Apps Script editor's Run button — that fails with `Cannot call
   SpreadsheetApp.getUi()` because it has no spreadsheet UI context; harmless,
   but confusing, and it means the change didn't actually take effect since it
   was run without the necessary menu/UI context in some flows).

index.html-only changes need no redeploy, just a page refresh.

**Editing index.html or the .gs file only changes the file in this repo.**
Neither takes effect on the live site until (a) index.html is pushed to
`main` (GitHub Pages picks it up automatically), and (b) for `.gs` changes,
someone does the manual redeploy above. Always tell the user which of these
is required after a change.

## APP_CONFIG.API_TOKEN

`index.html`'s `APP_CONFIG.API_TOKEN` and the `.gs` file's `API_TOKEN` const
must be identical strings, or every API call fails. This is **not** a real
secret (it's visible in the public page source) — it only stops casual
scraping/automated hits on the exec URL, not a determined reader of the JS.
If you change one, change the other in the same commit.

## Data conventions

- Multi-value fields are stored as a **single comma-separated string in one
  column**, not separate columns or a junction sheet: `Shop_Options`,
  `Category_Options`, `TypeOfAudit_Options` (all in Settings), a user's
  `Role` (e.g. `SHE-Auditor,SHE-Safety-Admin`), and `PhotoBeforeUrl` /
  `PhotoAfterUrl` (e.g. `url1,url2,url3`). Keep using this pattern rather than
  adding new columns — it's what the rest of the sheet already does.
- Multi-role permission model: a user's effective permissions are the
  **union** of what each of their roles grants (`currentRoles().includes(...)`
  checks), not a single "highest role wins" model.
- Photos: uploaded to a Drive folder, URL format must be
  `https://drive.google.com/thumbnail?id=<id>&sz=w1000`. **Not**
  `uc?export=view` — Google frequently serves a "can't scan for viruses"
  interstitial for that format instead of the image, which renders as a
  broken-image icon. There's a one-time menu item
  ("แก้ลิงก์รูปที่โหลดไม่ขึ้น (รูปแตก)") that migrates any old-format URLs
  already stored.
- Uploading a photo alongside create/update is done in the **same** API call
  (`createFinding`/`updateFinding` accept a `photos` payload) rather than a
  separate `uploadPhoto` call — each Apps Script round trip has real latency,
  so collapsing 2-3 calls into 1 measurably matters for perceived speed.
  Photos append to what's already on the record; they never replace it.

## Apps Script reliability

Google Apps Script Web Apps intermittently return an HTTP error or a
plain-text page instead of the expected JSON, for reasons outside our
control (not a bug in this code — it happened repeatedly during development
and self-resolved on manual retry). `apiCall()` in index.html retries
transient-looking failures (bad HTTP status, non-JSON body) up to twice with
backoff before surfacing an error. A well-formed `{ok:false, error:...}`
response (wrong password, record not found, etc.) is a real error and is
never retried.

Every `updateFinding_`/`createFinding_` call does slow work (Drive uploads,
email notifications) **outside** the `LockService` lock — only the actual
sheet read-modify-write is inside it — so one user's slow save doesn't queue
up everyone else behind it.

## Testing without live Google access

This is normally developed in a sandbox that cannot reach script.google.com.
Two techniques were used throughout and are worth reusing:
- **Demo mode**: blank out `APP_CONFIG.API_URL` in a scratch copy of
  index.html → `LIVE` becomes false → the app runs entirely against
  localStorage (see the `SheAPI`/`SheUsersAPI`/`SheSettingsAPI` demo branches).
  Good for UI/logic testing.
- **Mock backend**: a small Python `http.server` that speaks the same
  `{action, ...}` → `{ok, data}` JSON contract as `doPost()`, pointed to by a
  scratch copy's `API_URL`. Necessary for testing anything that only happens
  in the `LIVE` code path (token handling, combined photo-upload payloads,
  retry behavior) since demo mode never calls `apiCall()` at all.
Both were driven with Playwright, including request/response inspection to
verify things like "exactly one API call fires per save" rather than
guessing from the UI alone.

## Security/PDPA posture (see README.md for full detail)

- Passwords: SHA-256 hashed (unsalted), never returned to the client.
- The API_TOKEN is the only gate on the Apps Script endpoint — there is no
  per-session/per-user server-side auth beyond it. This was a conscious,
  documented tradeoff, not an oversight.
- Both this repo and the sibling `Safety-WorkPermit` repo are **public** on
  GitHub. Don't assume anything in either repo is private, including this
  file.
