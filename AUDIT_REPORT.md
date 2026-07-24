# Deployment Readiness Audit — PlacementPro

This report documents a full audit of the codebase: what was actually broken, what
was fixed, what was removed as dead weight, and what's still incomplete. Read the
"Still incomplete" section before going live — a few admin pages are routed in the
UI but have no backend behind them yet.

## TL;DR

The codebase itself was **not** full of sloppy junk — SQL is parameterized
throughout, `helmet`/rate-limiting/CORS/compression were already wired up, secrets
were never committed, and `.gitignore` was already correct. The real problem was
an **integration gap**: a large number of fully-written controllers and pages were
never connected to the router or to each other, so entire features silently
404'd or dead-ended in the UI. That's what most of this pass fixed.

---

## 1. Fixed: backend routes that were never registered

These controllers existed, were fully implemented, and were already called by
`frontend/src/services/api.js` — but `backend/src/routes/index.js` never required
or mounted them, so every one of these calls was hitting a 404 in production:

| Feature | Controller | Routes added |
|---|---|---|
| Admin analytics (cohort, growth, placement probability, scheduled reports, threshold alerts) | `controllers/analytics.js` | 18 routes under `/analytics/*` |
| Code operations (lint, format, playback, quality report, custom tests, workspaces) | `controllers/codeOps.js` | 11 routes under `/code`, `/submissions`, `/saved-custom-tests`, `/coding-problems` |
| Test-taking chat (student ↔ admin during a live test) | `controllers/testMessages.js` | 4 routes under `/test-messages` |
| Announcements | `controllers/announcements.js` | 4 routes under `/announcements` |
| Discussion forum (per coding problem) | `controllers/forum.js` | 7 routes under `/forum` |
| SMS notifications | `controllers/sms.js` | 4 routes under `/sms` (see below) |

All were mounted with the same `authenticate`/`requireAdmin` conventions already
used elsewhere in the file, and every edited file was verified with `node --check`.

**SMS controller was also incomplete**, not just unrouted: it had no handler for
a single-recipient send, and nothing ever wrote to the `sms_history` table that
the migration already creates. Added `sendSingleSMS` and `getHistory` so
`GET /sms/history` (which the frontend already calls) actually returns data.

## 2. Fixed: a real data-corruption bug

`controllers/announcements.js` → `updateAnnouncement` built its `UPDATE` query with:

```sql
SET ... , created_by = $7 WHERE id = $7
```

Both `created_by` and the `WHERE id` clause pointed at the **same** bound parameter
(the announcement's own id). Every edit to an announcement silently overwrote its
`created_by` column with the announcement's own id instead of leaving it alone.
Removed the erroneous `created_by = $7` assignment — `WHERE id = $7` was already
correct.

## 3. Fixed: unreachable frontend pages

Three fully-built pages were never added to `frontend/src/App.jsx`'s routes, so
even after fixing the backend they'd still have been unreachable:

- `pages/admin/AnnouncementsAdmin.jsx` → now routed at `/admin/announcements`
- `pages/student/Announcements.jsx` → now routed at `/student/announcements`
- `pages/admin/TestMonitor.jsx` → now routed at `/admin/test-monitor/:testId`
- `pages/student/Forum.jsx` → now routed at `/student/forum/:problemId`

Proof this wasn't speculative: `components/shared/NotificationBell.jsx` and
`pages/student/Notifications.jsx` **already call**
`navigate('/student/announcements')` / `navigate('/admin/announcements')` — those
calls were dead-ending before this fix.

**Not done:** no sidebar nav links were added for these (or for the existing
`lms`/`ats`/`webhooks`/`sms`/`payments` admin pages, which have the same gap —
routed but not in the nav array). That's a product/UX call about where they
belong, not a bug fix, so I left it for you rather than guess at placement,
icon, or copy. `pages/admin/Layout.jsx` and `pages/student/Layout.jsx` each have
a plain `{ to, label }` array — adding entries there is a five-minute job once
you decide where they go.

## 4. Removed: confirmed dead code

Verified with static analysis (grep across every `require()` in the backend, and
every `import`/API call in the frontend) that these had **zero** callers anywhere:

**Backend controllers deleted:** `calendar.js`, `feedback.js`, `practice.js`,
`profile.js`, `bookmarks.js`, `performance.js`

**Backend services deleted:**
- `smsService.js` — an exact-duplicate, never-imported second implementation of `services/sms.js`
- `judge0.js` — dead; code execution actually runs through the self-hosted Docker sandbox (`services/runner.js` + `docker/runners/`), not the Judge0 API. **Note:** `.env.example` still documents a `JUDGE0_API_URL`/`JUDGE0_API_KEY` setup path that the app doesn't use — that's stale documentation, not a missing feature. Left the env var docs as-is in case you want to actually wire Judge0 back in as an alternative execution backend, but be aware it currently does nothing.
- `calendar.js` (service) — only consumer was the controller deleted above

**npm dependencies removed** (backend `package.json`), confirmed unused anywhere
in the codebase, including the files just deleted:
`@boxyhq/saml20`, `activedirectory2`, `connect-pg-simple`, `morgan`, `ical-generator`

Also added `"engines": { "node": ">=20.0.0" }` to match both Dockerfiles
(`node:20-alpine`).

## 5. Still incomplete — do not assume these work

The frontend has **routed, imported pages** for these, and `services/api.js` has
full client methods for them, but there is **no backend controller at all** —
only a lower-level service helper module exists. I did not build these out,
because payment processing and SSO in particular need real credentials, a test
environment, and careful security review that I couldn't do here (no network
access, no database, no way to test a webhook signature or an OAuth callback in
this session). Fabricating untested route handlers for money movement or auth
felt like the wrong tradeoff.

| Frontend page (routed) | Service file (exists) | Missing |
|---|---|---|
| `pages/admin/Payments.jsx`, `pages/student/Payments.jsx` | `services/payment.js` (Stripe + Razorpay) | Controller + routes for `/payment/*` |
| `pages/admin/LMS.jsx` | `services/lms.js` | Controller + routes for `/lms/*` |
| `pages/admin/ATS.jsx` | `services/ats.js` | Controller + routes for `/ats/*` |
| `pages/admin/Webhooks.jsx` | `services/webhooks.js` | Controller + routes for `/webhooks/*` |
| (no dedicated page found) | `services/video.js` (Zoom/Meet) | Controller + routes for `/video/*` |
| (no dedicated page found) | `services/sso.js` (SAML/LDAP) | Controller + routes for `/auth/sso/*` |

If you're not going to finish these before launch, the safer short-term move is
to hide those five nav-reachable admin pages (or show a "coming soon" state)
rather than let admins hit a working-looking UI that silently fails on submit.

## 6. Security & config — already in good shape

- Parameterized SQL everywhere reviewed; no string-concatenated queries found.
- `helmet`, `compression`, CORS restricted to `FRONTEND_URL`, JSON body limit,
  Prometheus metrics, structured logging (`pino`), and a real `/health` check
  (DB + Redis + read-replica) were already present in `backend/src/index.js`.
- JWT verification fails closed (no default/fallback secret).
- No secrets committed; `.gitignore` already covers `.env`, `dist/`, `build/`, etc.
- `.env.example` is thorough and well-commented — kept as-is except noted above.

**Gaps worth your attention, not fixed here (config/ops decisions, not bugs):**
- Neither `package.json` (frontend or backend) has a `test` script or any
  lint config (`.eslintrc`/`.prettierrc` don't exist anywhere in the repo).
  There's a real Playwright e2e suite in `/tests`, but nothing enforces style
  or catches regressions like the ones in this report automatically.
- Consider running `npm audit` once you have network access in your own CI —
  I couldn't run `npm install` in this sandboxed session (no network egress),
  so dependency vulnerability scanning hasn't been done here.

## 7. What I did not touch

- `TODO.md` — left as-is; it's a genuine, well-maintained feature changelog,
  not clutter.
- `infra/`, `scripts/`, `docker*.yml`, monitoring configs (Grafana/Prometheus/Loki/Promtail) — reviewed structurally, found no duplication or obvious misconfiguration, left alone.
- Gamification, AI, proctoring, tenants/RBAC, GDPR, 2FA, question collaboration,
  drives, test templates, admin sessions — all fully wired and were left alone.
