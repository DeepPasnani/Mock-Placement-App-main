# Feature Design: Email System, Code Checker, CSV Import

**Date:** 2026-07-16
**Product:** CampusTrack (Mock Placement App)

---

## 1. Admin Email System

### 1.1 Overview

A dedicated email composer page in the admin panel that lets T&P coordinators send custom email communications to selected groups of students. Reuses the existing nodemailer transporter and HTML email wrapper from `services/email.js`.

### 1.2 Backend

**New endpoint:** `POST /api/email/send`
- **Auth:** `requireAdmin`
- **Body:**
```json
{
  "subject": "string (required)",
  "html": "string (required, rendered body content)",
  "recipients": {
    "allStudents": "boolean (optional, overrides other selectors)",
    "departments": ["string (optional)"],
    "batches": ["string (optional)"],
    "studentIds": ["string (optional)"]
  }
}
```
- **Logic:**
  1. Resolve recipient list:
     - `allStudents` → `SELECT email, name FROM users WHERE role='student' AND is_active=true`
     - `departments` → filter students by department
     - `batches` → resolve batch IDs to user IDs via `student_batches` + `users`
     - `studentIds` → direct lookup
  2. Deduplicate by email
  3. Send via `sendEmail()` (existing service)
  4. Log to `audit_log` with `action: 'email_sent'`, storing subject, recipient count, recipient list summary
- **Returns:** `{ sent: number, errors: number }`

**New route file:** `backend/src/routes/email.js` — mounted at `/api/email`

### 1.3 Frontend

**New page:** `frontend/src/pages/admin/SendEmail.jsx` at route `/admin/email`

**Added to sidebar nav** in `Layout.jsx` between "Results" and "Students".

**Recipient picker section:**
- "All Students" toggle (on → disables all other recipient controls)
- Department checkboxes — fetched from `SELECT DISTINCT department FROM users`
- Batch checkboxes — fetched from `batches` API
- Student search — async input hitting `/api/users?search=...&role=student`, results shown as removable chips

**Composer section:**
- **Template selector** dropdown at top — options: "Blank", "Test Scheduled", "Test Results", "Welcome", "Password Reset" — selecting a template pre-fills subject and body with the template's content
- Subject text input
- Body textarea with basic formatting toolbar (bold, italic, link, unordered list) → rendered to HTML
- Preview pane showing the rendered email wrapped in the existing `wrap()` template (with header/footer)
- **Send button** with confirmation dialog: "This will email N students. Continue?"

**No attachments.** No rich text library — formatting toolbar produces simple HTML inline.

### 1.4 Email Templates

Existing templates in `services/email.js` can be selected from the template selector to pre-fill the composer. The user can then edit before sending. Templates available:

| Template | Subject | Body |
|----------|---------|------|
| Welcome | Welcome to PlacementPro! | Standard welcome with account info |
| Test Scheduled | New Test: {title} | Test details, date, duration |
| Test Results | Your Results: {title} | Score breakdown |
| Password Reset | Password Reset OTP | OTP display |
| Admin Created | Admin Account Created | Credentials + instructions |

When a template is selected, the subject and body are pre-filled with the template text. The user can customize before sending.

---

## 2. Code Checker

### 2.1 Overview

Two-part feature: (A) per-test-case pass/fail display in the student test interface, (B) a self-hosted Docker-based code evaluator that can run alongside or replace Judge0.

### 2.2 Part A — Per-Test-Case UI

**Backend change:** Modify `POST /api/submissions/run-code` to optionally accept a `testCases` array in the body:

```json
{
  "code": "string",
  "language": "string",
  "testCases": [
    { "input": "string", "output": "string", "isHidden": false }
  ]
}
```

When `testCases` is present, return results array instead of single execution:

```json
{
  "results": [
    {
      "passed": true,
      "stdout": "5",
      "expected": "5",
      "input": "2 3",
      "time": "0.023",
      "hidden": false
    }
  ]
}
```

When `testCases` is absent, return existing single-execution format (backward compatible).

**Frontend change:** In the student `TestInterface.jsx`:
- Add a **"Run All Visible Tests"** button next to the existing "Run Code" button
- Both buttons send to the same endpoint; "Run All" adds `testCases` from the current problem's visible test cases
- Results table renders below the editor:

```
┌────────────────────────────────────────────────────┐
│ Run Code │ ▶ Run All Visible Tests  │ Language ▼  │
├────────────────── editor ──────────────────────────┤
│                                                    │
├─────────── Test Results ───────────────────────────┤
│ # │ Input    │ Expected │ Got          │ Status    │
│ 1 │ 2 3      │ 5        │ 5            │ ✅ Pass   │
│ 2 │ 10 20    │ 30       │ 30           │ ✅ Pass   │
│ 3 │ -1 1     │ 0        │ 0            │ ✅ Pass   │
└────────────────────────────────────────────────────┘
```

- Hidden test cases (`isHidden: true`) never shown to the student — they only run on final submit
- Results cleared when code changes

### 2.3 Part B — Docker Evaluator

**New service:** `backend/src/services/runner.js`

Language → Docker image mapping:

| Language | Image | Command |
|----------|-------|---------|
| python | `python:3.11-alpine` | `python /code/solution.py` |
| javascript | `node:20-alpine` | `node /code/solution.js` |
| java | `openjdk:19-slim` | `javac /code/Solution.java && java -cp /code Solution` |
| cpp | `gcc:13-bookworm` | `g++ /code/solution.cpp -o /code/sol && /code/sol` |
| c | `gcc:13-bookworm` | `gcc /code/solution.c -o /code/sol && /code/sol` |

**`runCode()` function:**
1. Generate UUID, create temp dir `/tmp/runs/{uuid}/`
2. Write code file (with appropriate extension, and a wrapper that reads stdin from `/dev/stdin`)
3. Spawn `docker run --rm --network=none --memory={memoryLimit}m --cpus=1 --pids-limit=50 --ulimit nproc=50 -v /tmp/runs/{uuid}:/code:ro -v /tmp/runs/{uuid}/stdin.txt:/dev/stdin:ro {image} sh -c "{command}"`
4. Pipe stdin via a temp file mount
5. Capture stdout/stderr with a 30s hard timeout
6. Parse execution time from `time` output
7. Clean up temp dir
8. Return `{ stdout, stderr, time, memory, passed, status }`

**`judgeSubmission()` function:** Same interface as `judge0.judgeSubmission()` — runs code against each test case, returns per-case results array. Runs test cases sequentially (parallel execution needs careful resource accounting — YAGNI for now).

**Integration with submission grading:**
- In `submissions.js` `submitTest()` — replace `judge0.judgeSubmission()` call with a wrapper that tries `runner.judgeSubmission()` first, falls back to Judge0 on any error
- Health check on server start: `docker info` → sets `process.env.DOCKER_AVAILABLE`
- Docker images are pulled lazily on first use (Docker handles this)

**Security boundaries (ponytail: this is the minimum that works for a college lab):**
- `--network=none` — no network access from inside container
- `--pids-limit=50` — prevents fork bombs
- `--memory` limit — prevents memory exhaustion
- `--cpus=1` — single CPU
- Read-only code mount (`:ro`)
- Hard 30s timeout on the whole docker run
- Temp dir cleaned up in `finally` block
- No host filesystem access beyond the code dir

**Ponytail note:** If concurrent submission volume grows beyond ~50 simultaneous runs, add a queue. For now, direct execution is fine.

### 2.4 Judge0 Fallback

Judge0 remains the fallback when Docker is unavailable (local dev, CI, or Docker daemon not running). The `services/judge0.js` module stays unchanged. A thin adapter in `submitTest()` tries `runner` first, catches, falls back to `judge0`.

---

## 3. CSV Import for Questions

### 3.1 Overview

Add CSV import to the question bank alongside the existing JSON import. Uses a unified CSV format with auto-detection of MCQ vs coding question type.

### 3.2 CSV Format

**Unified columns — all optional except `type` + per-type required fields:**

```
type,text,optionA,optionB,optionC,optionD,correctAnswer,title,description,sampleInput,sampleOutput,testCases,genre,difficulty,marks
```

**MCQ row example:**
```
mcq,"What is 2+2?",3,4,5,6,1,,,,,,quantitative,easy,2
```

**Coding row example:**
```
coding,,,,,,"Two Sum","Find two numbers in an array that add up to target","[1,2,3]\n9","[0,1]","[{""input"":""1 2\n3"",""output"":""0 1""},{""input"":""4 5\n9"",""output"":""0 1""}]",,hard,10
```

- CSV parsing: manual (stdlib `readline` + comma-split with quote handling) to avoid adding `csv-parse` dependency. Ponytail: add `csv-parse` only if real-world CSVs with complex quoting surface.
- `type == 'mcq'` → requires: text, optionA/B/C/D, correctAnswer (0-3 index)
- `type == 'coding'` → requires: title, description, sampleInput, sampleOutput
- `testCases` → JSON string for coding problems, parsed with `JSON.parse`
- `genre`, `difficulty`, `marks` → optional, apply defaults (same as existing bank)

### 3.3 Backend

**New endpoint:** `POST /api/question-bank/import-csv`
- **Auth:** `requireAdmin`
- **Content-Type:** `multipart/form-data` (file upload) OR `application/json` (paste)
- **Logic:**
  1. Parse CSV rows
  2. For each row, detect type and validate required fields
  3. Insert into `bank_questions` table using existing pattern
  4. Return `{ created: N, errors: [{ row: N, message: "..." }], skipped: N }`
- Adds file processing via `multer` (already in project) for file upload path

### 3.4 Frontend

**In the Question Bank page** (`QuestionBank.jsx`):
- Add a "CSV" toggle inside the existing import modal (currently JSON-only)
- JSON mode unchanged (existing behavior)
- CSV mode: textarea for pasting CSV + file upload button for `.csv` files
- "Load sample" button populates the textarea with a sample CSV
- Parse + preview: client-side parse and show a table preview of the first 5 rows before sending
- Import button sends to `/api/question-bank/import-csv`

---

## 4. File Changes Summary

### Backend
| File | Action |
|------|--------|
| `backend/src/routes/index.js` | Add routes for email endpoints |
| `backend/src/routes/email.js` | **New** — email send route |
| `backend/src/controllers/email.js` | **New** — email send controller |
| `backend/src/services/runner.js` | **New** — Docker-based code runner |
| `backend/src/services/email.js` | Export template bodies so composer can use them |
| `backend/src/controllers/submissions.js` | Wire Docker runner into `submitTest()` + `runCode()`, fallback to Judge0 |
| `backend/src/controllers/questionBank.js` | Add `importCsv` handler |

### Frontend
| File | Action |
|------|--------|
| `frontend/src/pages/admin/SendEmail.jsx` | **New** — email composer page |
| `frontend/src/pages/admin/Layout.jsx` | Add "Send Email" to sidebar nav |
| `frontend/src/services/api.js` | Add `emailAPI.send()` and `questionBankAPI.importCsv()` |
| `frontend/src/pages/admin/QuestionBank.jsx` | Add CSV import mode to import modal |
| `frontend/src/pages/student/TestInterface.jsx` | Add "Run All Visible Tests" button + results table |
| `frontend/src/App.jsx` | Add email route |

---

## 5. Open Questions & Constraints

- **Docker** must be installed on the production server for the runner to work
- **Judge0 API key** still needed as a fallback (keep existing env vars)
- **Rate limits** on `/api/email/send` — `emailLimiter` with a low cap (e.g., 5 requests per minute) to prevent accidental mass sends
- **Email preview** renders on client side — no server-side preview endpoint (YAGNI)
- **CSV parsing** uses stdlib initially; can add `csv-parse` if real-world files show edge cases
