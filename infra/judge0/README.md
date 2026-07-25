# Running Judge0 locally (self-hosted)

This replaces the RapidAPI-hosted Judge0 (50 free requests/day) with your own
instance running on your machine, using the official images from
[judge0/judge0](https://github.com/judge0/judge0). It also switches test-case
checking from one-request-per-test-case to Judge0's **batch** endpoint, so all
of a question's test cases are submitted and executed at the same time
instead of sequentially.

## 1. Prerequisites

- Docker + Docker Compose
- Linux or macOS (Judge0 is not officially supported on Windows — use WSL2 if
  you're on Windows)
- On modern Linux distros using cgroup v2 (e.g. recent Ubuntu, Fedora),
  Judge0's isolate sandbox needs cgroup v1. If `docker-compose up` fails with
  `rb_sysopen` or `status 13 (Internal Error)`, add to your kernel boot
  parameters and reboot:
  ```
  systemd.unified_cgroup_hierarchy=0 systemd.legacy_systemd_cgroup_controller=1
  ```

## 2. Set your passwords

Open `infra/judge0/judge0.conf` and replace the two placeholder passwords:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Use one generated value for `REDIS_PASSWORD` and a different one for
`POSTGRES_PASSWORD`. Never reuse the placeholders from this repo outside your
own machine.

## 3. Start Judge0

```bash
cd infra/judge0
docker-compose up -d db redis
sleep 10          # let Postgres/Redis finish initializing
docker-compose up -d
sleep 5
docker-compose ps # all four services should show "Up"
```

Verify it's alive:

```bash
curl http://localhost:2358/system_info
```

Full interactive API docs: http://localhost:2358/docs

## 4. Point the backend at it

In `backend/.env`:

```bash
JUDGE0_API_URL=http://localhost:2358
# Leave these two blank/unset — they're only needed for the RapidAPI-hosted
# option, not for a self-hosted instance:
# JUDGE0_API_KEY=
# JUDGE0_API_HOST=

# Optional — see backend/src/services/runner.js:
#   judge0   -> always use this Judge0 instance
#   sandbox  -> always use the local per-container Docker runner instead
#   (unset)  -> auto-detect: use Judge0 if JUDGE0_API_URL is set
CODE_EXECUTION_PROVIDER=judge0
```

Restart the backend (`npm run dev` in `backend/`). Submitting code now goes
through `backend/src/services/judge0.js`, which:

- **Single "Run"** clicks (`POST /submissions/run-code`) → one submission,
  same as before.
- **Full submit against a question's test cases** (`judgeSubmission`) → all
  test cases are sent together via `POST /submissions/batch`, so Judge0's
  workers execute them **simultaneously** rather than one HTTP round-trip per
  test case. The code polls `GET /submissions/batch` until every test case is
  out of the queue.

If the batch endpoint is unreachable for any reason, `judge0.js`
automatically falls back to submitting test cases one at a time so grading
doesn't hard-fail.

## 5. Scaling concurrency

`infra/judge0/docker-compose.yml` sets `COUNT=4` on the `worker` service —
that's how many submissions can run at once. If you have CPU/RAM to spare and
want faster grading for tests with many test cases or many students
submitting at once, raise it:

```yaml
worker:
  environment:
    - COUNT=8
```

Each worker executes one submission inside an isolated sandbox at a time, so
`COUNT` should stay well below your machine's core count if you're also
running Postgres/Redis/the app itself locally.

## 6. Supported languages

`backend/src/services/judge0.js` currently maps: Python, JavaScript (Node),
Java, C++, C, Go, Rust, Ruby, Kotlin. To add a language, look up its
`language_id` at `GET /languages` on your running instance and add it to the
`LANGUAGE_IDS` map.

## Reverting to the old (RapidAPI) or fully-local sandbox setup

- **RapidAPI-hosted Judge0**: set `JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com`
  plus `JUDGE0_API_KEY` / `JUDGE0_API_HOST` in `backend/.env` — `judge0.js`
  detects the RapidAPI headers automatically and adds them.
- **Local Docker sandbox (no Judge0 at all)**: set
  `CODE_EXECUTION_PROVIDER=sandbox` in `backend/.env`. This uses the
  per-language Docker containers in `backend/src/services/sandbox.js` that
  the project shipped with before Judge0 was wired in.
