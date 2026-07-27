<div align="center">

# CampusTrack

**A full-stack placement-preparation & mock-assessment platform for college T&P cells.**

Build multi-section aptitude + coding tests, invite students in bulk, watch submissions come in live, and get auto-graded results with percentile analytics — all from one dashboard.

</div>

---

## Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Option A: Docker Compose (recommended)](#option-a-docker-compose-recommended)
  - [Option B: Manual / local dev](#option-b-manual--local-dev)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Image Uploads](#image-uploads)
- [Supported Coding Languages](#supported-coding-languages)
- [Deploying to Production](#deploying-to-production)
- [Backing Up & Restoring Data](#backing-up--restoring-data)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Test Builder** — three-step wizard for multi-section tests mixing MCQ (aptitude) and coding sections, each with its own timer, difficulty mix, and pass criteria.
- **Question Bank** — build a reusable library of questions once and pull them into any future test.
- **Live Code Execution** — full Monaco editor with grading against hidden test cases via [Judge0](https://github.com/judge0/judge0); supports Python, JavaScript, Java, C, C++, Go, Rust, Ruby, Kotlin, and **SQL (SQLite)**.
- **Real-Time Proctoring** — WebSocket heartbeat monitoring, tab-switch detection, fullscreen enforcement, keystroke/plagiarism signals, and automatic submission on expiry.
- **Results & Analytics** — score distributions, percentile rankings, per-question breakdowns, cohort/placement-probability analytics, scheduled reports, and CSV/PDF export.
- **Gamification** — XP, levels, streaks, achievements, a leaderboard, and a daily challenge to keep students practicing between tests.
- **Multi-admin support** — every admin account sees and can manage the full shared pool of tests, batches, and question banks (not just their own).
- **Google OAuth login** for students, email/password for staff, with optional SSO (SAML/LDAP), LMS, and ATS integrations for larger deployments.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, TanStack Query, Zustand, Tailwind CSS, Monaco Editor |
| Backend | Node.js, Express, PostgreSQL (`pg`), Redis, JWT auth, Helmet, Pino |
| Code execution | [Judge0 CE](https://github.com/judge0/judge0) (self-hosted or RapidAPI-hosted), with a local Docker-sandbox fallback |
| Infra | Docker Compose, Nginx (frontend reverse proxy) |

## Architecture

```
┌────────────┐      /api/*      ┌────────────┐      SQL       ┌────────────┐
│  Frontend  │ ───────────────► │  Backend   │ ──────────────► │ PostgreSQL │
│  (Nginx)   │ ◄─────────────── │  (Express) │ ◄────────────── │            │
└────────────┘                  └─────┬──────┘                └────────────┘
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼             ▼
                     ┌────────┐  ┌──────────┐  ┌───────────┐
                     │ Redis  │  │  Judge0   │  │  SMTP /   │
                     │(cache) │  │ (grading) │  │  Google   │
                     └────────┘  └──────────┘  └───────────┘
```

Images (question/option images) are stored directly as `bytea` rows in PostgreSQL and served from `GET /api/images/:id` — no external file host required, and uploads survive backend restarts/redeploys/scaling.

## Getting Started

### Option A: Docker Compose (recommended)

Prerequisites: [Docker](https://docs.docker.com/get-docker/) and Docker Compose.

```bash
git clone <this-repo-url>
cd Mock-Placement-App-main

cp backend/.env.example backend/.env
# Edit backend/.env — at minimum set JWT_SECRET, REFRESH_TOKEN_SECRET,
# and your Google OAuth credentials. See "Environment Variables" below.
#
# NOTE: backend/.env is NOT read when running via Docker (this Option A
# path) — it's excluded from the image and docker-compose.yml doesn't
# mount it in. It only matters for Option B (manual/local dev) below.
# Values baked into docker-compose.yml's `environment:` blocks are what
# actually reach the containers. For anything you want to override there
# (most commonly SMTP, so password-reset OTP emails actually send) —

cp .env.example .env
# Edit the root .env — at minimum SMTP_HOST/SMTP_USER/SMTP_PASS if you
# want OTP/notification emails to send. docker-compose.yml substitutes
# these in automatically. Leave them blank to keep email sending
# disabled (the previous default — no error, emails are just skipped).

docker compose up --build
```

This starts Postgres, Redis, the backend API, the frontend (served via Nginx on port 2828), pgAdmin, and runs database migrations automatically via the `backend-init` service.

- Frontend: http://localhost:2828
- Backend API: http://localhost:5000/api
- pgAdmin: http://localhost:5050

To also run code execution locally, see [`infra/judge0/README.md`](infra/judge0/README.md) for the self-hosted Judge0 stack, or use RapidAPI's hosted Judge0 (see `.env.example`).

To verify your SMTP setup independently of the app (useful after editing
the root `.env`), run: `docker compose exec backend node scripts/test-smtp.js you@example.com` — it checks the credentials and sends a real test
email through the exact same code path the app uses for OTPs.

### Option B: Manual / local dev

Prerequisites: Node.js 20+, PostgreSQL 14+, Redis (optional but recommended).

```bash
# 1. Backend
cd backend
cp .env.example .env   # fill in DATABASE_URL, JWT secrets, SMTP, etc. —
                        # this file IS read directly here (Option B), unlike
                        # under Docker (Option A above)
npm install
npm run db:migrate     # creates all tables
npm run test:smtp -- you@example.com   # optional: verify SMTP creds work
npm run dev             # starts on :5000 with nodemon

# 2. Frontend (in a second terminal)
cd frontend
npm install
npm run dev              # starts on :5173, proxies /api and /uploads to :5000
```

Open http://localhost:5173.

**Creating your first admin account:** register a user through the app's signup flow, then promote them directly in the database:

```sql
UPDATE users SET role = 'super_admin' WHERE email = 'you@yourcollege.edu';
```

## Environment Variables

All backend configuration lives in `backend/.env` when running manually (Option B) — see [`backend/.env.example`](backend/.env.example) for the full, documented list. **When running via Docker (Option A), `backend/.env` is ignored instead**; use the root [`.env.example`](.env.example) (copy to `.env` next to `docker-compose.yml`), which `docker-compose.yml`/`docker-compose.prod.yml` substitute in via `${VAR}`. The essentials to get running:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `JWT_SECRET`, `REFRESH_TOKEN_SECRET` | ✅ | Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✅ (for student login) | From Google Cloud Console |
| `REDIS_URL` | Recommended | Falls back gracefully if unset |
| `JUDGE0_API_URL` / `CODE_EXECUTION_PROVIDER` | Recommended | Self-hosted, RapidAPI-hosted, or local sandbox fallback |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Optional | For email notifications, incl. password-reset OTPs. Under Docker, set these in the **root** `.env`, not `backend/.env`. Verify with `node scripts/test-smtp.js you@example.com` (or `docker compose exec backend node scripts/test-smtp.js you@example.com`) |
| `VITE_API_URL` (frontend) | Depends on topology | Use a relative `/api` when frontend+backend share an origin (e.g. behind the provided Nginx config); use the full backend URL (`https://api.yourdomain.com/api`) when they're hosted separately |

> **Security note:** never commit a real `.env` file. Rotate any secret that has ever been committed to source control or shared outside your team, even after removing it from the file.

## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── controllers/   # Route handlers (business logic)
│   │   ├── routes/        # Express route registration
│   │   ├── middleware/    # auth, rate limiting, validation, tenancy
│   │   ├── services/      # judge0, sandbox, email, scheduler, redis, etc.
│   │   └── db/            # migrate.js (schema) + seed.js
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/admin/       # Admin dashboard, test builder, analytics
│   │   ├── pages/student/     # Student dashboard, test-taking, gamification
│   │   ├── components/shared/ # Reusable UI (editor, cards, tables, etc.)
│   │   └── services/api.js    # Axios client + all API method definitions
│   ├── nginx.conf
│   └── Dockerfile
├── infra/judge0/           # Self-hosted Judge0 docker-compose + config
├── scripts/                # Maintenance / one-off scripts
├── tests/                  # Automated test suites
├── docker-compose.yml
└── docker-compose.prod.yml
```

## Image Uploads

Question and option images are uploaded via `POST /api/upload/image` (admin-only), stored as `bytea` rows in the `images` Postgres table, and served publicly (no auth header needed, same as a static file) from `GET /api/images/:id` with long-lived cache headers. This means:

- Images survive backend restarts, redeploys, and horizontal scaling — nothing is written to local disk.
- No third-party file host (S3, Cloudinary, etc.) or extra credentials are needed.
- Uploads work correctly whether the frontend and backend share a domain or are hosted separately (the frontend resolves the image URL against the API's own origin, not the page's origin).

## Supported Coding Languages

Python, JavaScript, Java, C, C++, Go, Rust, Ruby, Kotlin, and **SQL (SQLite)**.

For SQL problems, put the schema-setup + sample data (e.g. `CREATE TABLE` / `INSERT` statements) in each test case's **input**, and have students write only their query as their **answer**. The grading harness concatenates the two before executing, so the student's query always runs against a freshly-seeded database, and the printed query result is compared against the test case's expected output — the same model used for every other language.

Admins can restrict which languages are available per test under **Test Settings → Allowed Coding Languages**.

## Deploying to Production

`docker-compose.prod.yml` is a production-oriented compose file (health checks, restart policies, resource limits). Typical flow:

1. Provision Postgres and Redis (managed services like Neon/Supabase/Upstash work well, or run them yourself).
2. Set all required env vars (see above) with real, freshly-generated secrets.
3. Run migrations: `docker compose -f docker-compose.prod.yml run --rm backend-init` (or `npm run db:migrate` directly against your DB).
4. If frontend and backend are on **separate domains**, set `VITE_API_URL` to the full backend URL at *build time* (it's baked into the frontend bundle).
5. Deploy. If you're not using the provided Docker/Nginx setup, make sure your reverse proxy forwards `/api/*` to the backend, and that CORS's `FRONTEND_URL` env var matches your actual frontend origin.

## Backing Up & Restoring Data

To move data between databases (e.g. from a local Postgres you've been testing against, into a fresh server instance) without losing your tests, admins, or students, use `pg_dump` / `pg_restore` — see the command your project maintainer shared with you, or:

```bash
# On your local machine — dump everything:
pg_dump -Fc -h localhost -U postgres -d campustrack -f campustrack_backup.dump

# Copy campustrack_backup.dump to the server, then restore into the target DB:
pg_restore --no-owner --no-privileges --clean --if-exists \
  -h <server-host> -U <server-db-user> -d campustrack campustrack_backup.dump
```

Always take a fresh dump immediately before cutting over, and verify row counts (`SELECT COUNT(*) FROM tests;`, `SELECT COUNT(*) FROM users WHERE role != 'student';`, etc.) on the restored database before pointing production traffic at it.

## Troubleshooting

- **Password-reset OTP / other emails never arrive** — the API always replies with a generic success message ("If that email exists...") even when sending silently failed, to avoid leaking which emails are registered — so check the *actual* delivery path instead of the UI response. Run `node scripts/test-smtp.js you@example.com` (from `backend/`, or `docker compose exec backend node scripts/test-smtp.js you@example.com` under Docker) to verify credentials and send a real test message. Under Docker, remember SMTP vars come from the **root** `.env`, not `backend/.env` (see Environment Variables above) — the single most common cause of this.
- **Images not showing up** — make sure the migration ran (`images` table must exist) and that `VITE_API_URL` is correct for your deployment topology (see [Environment Variables](#environment-variables)).
- **"Not found" errors on an admin page** — usually means the frontend and backend versions are out of sync (an older frontend build calling a route that doesn't exist yet, or vice versa); rebuild/redeploy both together.
- **Code submissions time out or fail** — check `CODE_EXECUTION_PROVIDER` and that Judge0 (self-hosted or RapidAPI) is reachable from the backend container; see `infra/judge0/README.md`.
- **A newly created admin can't see a colleague's tests** — confirm both accounts have `role = 'admin'` or `'super_admin'` in the `users` table; only the `student` role is scoped to published tests in their department.

## License

Proprietary — internal use for your institution unless you specify otherwise.
