# CampusTrack — Pre-Deployment TODO

## Critical (deployment blockers)

- [x] **Wire up WebSocket server**
  `backend/src/index.js` now uses `http.createServer(app)` with `WebSocketServer` instantiated at `/ws`. The `services/websocket.js` handler authenticates via JWT token query param and processes `HEARTBEAT` messages by calling `trackActiveUser()` in Redis.

- [x] **Rotate all committed secrets**
  New JWT secrets generated. `backend/.env` and `frontend/.env` added to `.gitignore`. Root `.env` is already gitignored. Created clean `backend/.env` with placeholder values for all third-party services.

- [x] **Fix SQL injection in listTests**
  `backend/src/controllers/tests.js` — replaced string interpolation (`'${userId}'`) with parameterized queries. Super_admin filter also fixed to see all tests properly.

- [x] **Configure all third-party services**
  Created `backend/.env` with configuration keys for Cloudinary, Judge0, SMTP, Google OAuth. User must fill in real values.

- [x] **Create production `frontend/.env`**
  Created `frontend/.env` with production defaults based on `.env.example`.

## High Priority

- [x] **Add dependency health check**
  `/api/health` now verifies PostgreSQL (`SELECT 1`) and Redis (`PING`) before returning `status: ok`. Returns `503` with `status: degraded` if either is unreachable.

- [x] **Externalize migration from Docker CMD**
  Created `docker-entrypoint.sh` with `SKIP_MIGRATION` env var. Dockerfile uses entrypoint (migration runs by default). Added `backend-init` service in `docker-compose.yml` for one-shot migration/seed. Backend container starts with `SKIP_MIGRATION=1` to avoid re-running migrations.

- [x] **Add general API rate limiter**
  `apiLimiter` (300 req / 15 min) applied blanket via `router.use(apiLimiter)` in routes. Per-endpoint limiters (auth, code, bulk import, email) remain in place.

- [x] **Fix listTests admin filter**
  Replaced raw string interpolation with parameterized queries. Super_admin now sees all tests; admin sees own tests; students see published tests matching their department.

## Medium Priority

- [x] **Verify Google OAuth redirect URIs**
  Created `scripts/verify-oauth.js` — reads frontend/backend env files and prints the exact URIs to register in Google Cloud Console. Run with: `node scripts/verify-oauth.js`

- [x] **Configure Nginx SSL**
  Updated `frontend/nginx.conf` with HTTPS server block (443 SSL + HTTP→HTTPS redirect). Created `scripts/setup-ssl.sh` — automates certbot certificate acquisition, copies certs to `certs/` directory, and sets up auto-renewal cron.

- [x] **Add structured logging**
  Replaced `console.log` / `console.error` across all controllers and services with `pino` logger via `services/logger.js`. HTTP request logging via `pino-http`.

- [x] **Add automated tests**
  Created `e2e/smoke.spec.js` — Playwright smoke test covering admin login → test creation → student login → start/save/submit → view results. Also tests `/api/health` endpoint. Run with: `npx playwright test e2e/smoke.spec.js`

- [x] **Ensure Monaco editor loads correctly**
  Created `frontend/src/lib/monaco.js` — configures the Monaco editor `loader` with a configurable CDN path (`VITE_MONACO_CDN` env var) so it can use a self-hosted fallback instead of the default CDN. Imported in `main.jsx`.

## Low Priority

- [x] **Prune unused dependencies**
  Removed `@google/generative-ai` from `frontend/package.json` (not imported anywhere). `gsap` is imported and used in `Landing.jsx`, so kept.

- [x] **Upgrade `react-query` v3 to TanStack Query v5**
  Migrated all 14 files from `react-query` to `@tanstack/react-query` v5:
  - Updated `QueryClient` config (`cacheTime` → `gcTime`)
  - `useQuery` → object syntax `useQuery({ queryKey, queryFn, ... })`
  - `useMutation` → object syntax `useMutation({ mutationFn, ... })`
  - `invalidateQueries('key')` → `invalidateQueries({ queryKey: 'key' })`
  - `enabled`/`onSuccess` callbacks moved to object properties

- [x] **Add database backup strategy**
  Created `scripts/backup-db.sh` — `pg_dump` in custom format with gzip compression, keeps last 30 backups. Added `db-backup` service in `docker-compose.yml` that runs the script daily at 3 AM via cron.

- [x] **Set up CI/CD pipeline**
  Created `.github/workflows/ci.yml` — GitHub Actions workflow with:
  - Lint & Build stage (frontend build, optional eslint)
  - Test stage (backend against PG + Redis)
  - Deploy stage (placeholder — runs on main branch push)

- [x] **Add Docker Compose healthcheck for backend**
  Backend service now has a healthcheck hitting `/health` endpoint with 30s interval, 10s timeout, 3 retries, 30s start period.

- [x] **Add monitoring / alerting**
  Created `scripts/monitor-health.sh` — uptime check script hitting `/health`, logs timestamps, emits alerts on failure. Optionally sends email alerts. Add to crontab: `*/5 * * * * /path/to/scripts/monitor-health.sh https://campustrack.app`
