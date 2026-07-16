# CampusTrack — Merge Notes

You uploaded two versions of the same project (**CampusTrack**, your placement-test
platform):

| | `ezyZip.zip` | `workspace-....tar` |
|---|---|---|
| What it is | The **real, deployed app** — React 18 + Vite frontend, Express + PostgreSQL + Redis backend, Judge0 code execution, live at campustrack.deadpan.qzz.io | A **Next.js UI-redesign prototype** — frontend-only, driven by mock data / Zustand store, no real backend wired up (default Prisma scaffold, unused) |
| Framework | React 18 + Vite, custom "ink/deck/panel" design-token CSS | Next.js 15 (App Router) + shadcn/ui + Tailwind |
| Backend | Full Express API, Postgres schema, Redis sessions, Judge0 grading, Cloudinary uploads, email service | None — `mock-data.ts` only |

Since the tar project has no working backend, "combining both" meant: **keep the
real, production backend and frontend from the zip as the base**, and port over the
genuinely new *feature ideas* from the Next.js prototype that the zip didn't already
have — wired up for real, not just visually.

## What was already in both (kept as-is)
- Admin test builder, aptitude + coding question editors, results/leaderboard/CSV
  export, student bulk import, batch management, admin accounts
- Student exam UI, Monaco code editor, live code execution, auto-save, timers
- **Resume Sessions** — the tar prototype had a mock "Resume Sessions" screen; the
  zip already has this as a real feature (`POST /api/submissions/resume/:id`,
  surfaced in Admin → Results), so nothing needed to be added here.

## What was genuinely missing and has been added (real, working code)
1. **Question Bank** (`/admin/question-bank`) — the standout feature from the
   prototype that the production app didn't have: a reusable library of MCQ and
   coding questions, independent of any single test.
   - New table `bank_questions` (migration in `backend/src/db/migrate.js`)
   - New controller/routes: `backend/src/controllers/questionBank.js`,
     `GET/POST /api/question-bank`, `POST /api/question-bank/import` (bulk JSON),
     `DELETE /api/question-bank/:id`
   - New admin page `frontend/src/pages/admin/QuestionBank.jsx` (search/filter,
     create, JSON import, delete) — built with your existing UI kit, not shadcn
   - **"Add from Bank"** button wired into the Test Creator so a bank question can
     be dropped straight into any section with one click
   - Nav link added to the admin sidebar

2. **Public Landing page** (`/`) — previously `/` redirected straight to `/login`.
   Signed-out visitors now see a real marketing page (hero, feature grid, stats,
   CTA) restyled from the prototype's `Landing.tsx` into your ink/deck/gold token
   system and starfield background; signed-in users still skip straight to their
   dashboard.

## What was intentionally left out
The Next.js prototype's other screens (`AdminDashboard`, `DrivesList`,
`StudentDashboard`, etc.) are re-skins of screens the zip already implements more
completely (with real batches, real auth, real settings) — porting them would mean
downgrading working functionality to match a mock UI, so they were not merged.

## Update — Masterplan audit (round 2)

After the initial merge, the original `Masterplan.md` for this project was checked
against the merged codebase feature-by-feature. Five real gaps were found and have
now been implemented (not stubbed):

1. **PDF export** — `GET /api/submissions/test/:testId/export-pdf` streams a
   formatted PDF (summary stats, class-wise breakdown, full leaderboard) using
   `pdfkit`. "Export PDF" button added next to "Export CSV" in Admin → Results.

2. **Functional batch → MCQ-set mapping** — this was previously a stub
   (`test_batches.section_mapping` was written but never read). Now:
   - Questions can be tagged **Set A/B/C/D** in the Test Creator
   - A new **"Batches" button** on each test in Admin → Tests opens a modal to
     create batches and map each one to a set for that specific drive
   - `GET /api/tests/:id` filters the aptitude section's questions down to the
     set assigned to the requesting student's batch (defaults to Set A when a
     batch has no mapping, so existing tests behave exactly as before)
   - Redis caching was made batch-aware (`test:<id>:full:<batch>`) so one
     batch's cached test data can never leak into another's

3. **Independent MCQ / coding round timers** — a "Independent MCQ / Coding time
   limits" toggle in the Test Creator now lets an admin set two separate clocks.
   Once the MCQ clock elapses, students are auto-moved into the coding round and
   the MCQ section is locked (tab disabled, toast shown) while the overall test
   deadline (enforced server-side) is kept in sync as their sum.

4. **Enrollment number / class / batch at self-registration** — the signup form
   now collects Enrollment No., Batch, and Year of Study alongside the existing
   name/email/department fields, matching the masterplan's signup requirements.

5. **Historical batch/year snapshot** — `submissions.batch_snapshot` and
   `year_snapshot` are now captured the moment a student starts a test, so a
   later semester reshuffle can't rewrite a past drive's class-wise numbers.
   Admin → Results now has a **class/batch filter** and a **class-wise
   breakdown table** (average %, pass rate per batch) built on this snapshot —
   closing the loop on the masterplan's "class-wise views" requirement, which
   didn't exist in either original codebase.

**Also fixed as a side effect:** the auth middleware wasn't attaching
`department`/`batch`/`year_of_study` to `req.user` at all, which silently broke
the existing department-based test filtering in `listTests`. That's corrected now.

Re-run the DB migration once more after pulling this version — several new
columns (`bank_questions`, `question_set`, `batch_snapshot`, `year_snapshot`)
need to be created.

## Running it
Nothing changed about how you run the project — see `README.md` /
`docker-compose.yml` as before. Just re-run the migration once
(`npm run db:migrate` in `backend/`, or restart Docker Compose) to pick up the new
`bank_questions` table.

`node_modules` and `dist`/`.git` were stripped out of this zip to keep it small —
run `npm install` in both `frontend/` and `backend/` before starting.

---

## Round 2 — Masterplan gap-fill

After the merge above, you shared your original `Masterplan.md` and asked for an
audit against it. Five real gaps were found and are now implemented:

1. **PDF export** — `GET /api/submissions/test/:testId/export-pdf` streams a
   formatted summary report (pdfkit): header, summary stats, class-wise
   breakdown, and full leaderboard. New "Export PDF" button next to "Export CSV"
   in Admin → Results.

2. **Functional batch → MCQ-set mapping** — questions can now be tagged into
   sets A–D (dropdown next to Genre in the Test Creator). A new **Batches**
   button on each row in Admin → Tests opens a modal to create batches and map
   each one to a set for that specific drive. At test-serving time, the backend
   filters the aptitude section to only the set assigned to the requesting
   student's batch (unmapped tests/batches default to Set A — unchanged
   behaviour). The per-test cache is now keyed per batch so different batches
   never see each other's cached set.

3. **Independent MCQ / coding time limits** — a "Independent MCQ / Coding time
   limits" checkbox in the Test Creator's settings reveals two separate duration
   fields; the overall Duration field is kept in sync automatically. In the
   exam UI, once the MCQ sub-clock elapses, aptitude section tabs lock (visibly,
   with a lock icon) and the student is auto-moved into the coding round, while
   the overall test clock keeps running as before.

4. **Enrollment number / class / batch at registration** — the signup form now
   collects Enrollment No., Department, Batch, and Year of Study (previously
   these were admin-only, set via CSV import).

5. **Historical batch/year snapshot** — `submissions.batch_snapshot` /
   `year_snapshot` are captured the moment a student starts a test, so later
   semester reshuffles can't rewrite past results. Admin → Results now has a
   **class-wise breakdown panel** (average score & pass rate per batch, click to
   filter the leaderboard) built on top of these snapshots, and CSV export
   includes a Batch column.

Two smaller latent bugs were fixed along the way since the new features
depended on them: the authenticated-user object didn't actually include
`department`/`batch`/`year_of_study` (so department-based test filtering was
silently broken), and there was no cache-busting for the batch/set mapping.
Both are fixed as part of this pass.

### Still not implemented (by design, out of scope for this pass)
- CSV bulk-import still commits row-by-row rather than showing a dry-run
  preview before committing.
- SQL and plain C are still not wired into Judge0 (only Python, JavaScript,
  Java, C++) — adding a language is mechanical but wasn't part of this request.
