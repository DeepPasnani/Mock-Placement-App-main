# Remaining Features (per Masterplan Spec)

## Phase 1 — Foundation

### Admin panel & student portal shell
- [x] Basic admin panel shell — Exists
- [x] Student portal shell — Exists
- [x] Student self-registration (college email, password, enrollment number, class, batch) — Exists
- [x] Admin accounts (flat permissions, no roles/tiers) — Exists (has super_admin/admin but no tiered roles)

### CSV/JSON data imports
- [x] **JSON import for MCQ questions** — Added `POST /question-bank/import-json` endpoint with format validation
- [x] CSV import for MCQ questions — Exists
- [x] **Bulk update student batch/year-of-study via CSV** — Added `POST /users/bulk-update-batch` endpoint + UI in Students page

### MCQ question management
- [x] Create MCQ questions manually — Exists
- [x] Tag questions by genre (quantitative, general aptitude, technical, verbal reasoning, logical, data interpretation) — Exists

---

## Phase 2 — Core Test-Taking Flow

### Drive creation (admin)
- [ ] **Dedicated "drive" abstraction** — Introduce a `drives` table (future expansion)
- [x] Set time limits independently for MCQ and coding rounds — Exists (`splitTimers`, `mcqDurationMinutes`)
- [x] Map batches to test sets (A/B/C/D per batch) — Exists (`test_batches` with `section_mapping`)
- [x] Set difficulty (easy/hard) and marks for coding questions — Exists

### MCQ test-taking interface
- [x] MCQ interface with timer — Exists
- [x] No-negative-marking scoring — Exists (configurable setting)
- [x] Tab-switch tracking — Exists
- [x] Auto-submit after 5 tab switches — Exists
- [x] **MCQ question text with code snippet formatting** — Admin editor has "Insert Code" button; student viewer renders ```code``` blocks with `<pre><code>` syntax highlighting

### Coding question interface
- [x] Choose 3 of 5 coding questions — Exists
- [x] Constraint: max 2 easy, max 1 hard — Exists
- [x] **Server-side validation of coding problem selection** — Backend rejects selections violating ≤3 problems, ≤2 easy, ≤1 hard during submit
- [x] Judge0 code editor (Monaco) — Exists
- [x] Supported languages: C, C++, Python, Java — Exists
- [x] Sample test cases + error feedback on hidden test cases — Exists
- [x] Run code before final submission — Exists

### Security (server-side enforcement)
- [x] **Server-authoritative timer** — Backend calculates elapsed time from `started_at` at submit time; auto-submits if time expired before grading
- [x] **Server-side auto-submit on tab-switch limit** — Backend independently checks tab-switch count from DB during submission and force-submits if exceeded

---

## Phase 3 — Admin Dashboard & Results

### Aggregate dashboard
- [x] Genre-wise MCQ accuracy bar chart — Exists
- [x] Difficulty-wise performance bar chart (easy/medium/hard) — Exists
- [x] Coding problem performance bar chart — Exists
- [x] Summary stat cards — Exists
- [x] **Score distribution chart on dashboard** — Added to aggregate Dashboard
- [x] **Class-wise/batch views on dashboard** — Added batch breakdown table on Dashboard
- [x] **Dashboard test selector / date range filters** — Added test selector and period filter on Dashboard

### Results page
- [x] Batch/class filter — Exists
- [x] Class-wise breakdown table — Exists
- [x] Score distribution chart — Exists
- [x] Rank sorting — Exists
- [x] **Column sorting** — Click column headers to sort by name, score, percentage, time
- [x] **Student name / roll number search** — Search bar on results page

### Export
- [x] PDF export (formatted summary report) — Exists
- [x] **Backend CSV export endpoint** — Added `GET /submissions/test/:testId/export-csv` returning raw data as CSV with optional batch filter
- [x] **Export filtered subsets** — CSV endpoint accepts `?batch=` param to export only filtered batch

### Admin resume
- [x] Manually resume auto-submitted test — Exists
- [x] Preserve remaining time on resume — Exists

---

## Phase 4 — Testing, Polish, Launch

- [ ] **End-to-end tests** — Expand Playwright smoke tests to cover full MCQ flow, coding flow (choose 3 of 5, run code, submit), tab-switch auto-submit, admin resume, and CSV/PDF export
- [ ] **Judge0 load test** — Validate 150 concurrent code executions during coding round without degrading login/dashboard/MCQ responsiveness for other students
- [x] **UI polish: coding problem selection** — Progress bar, remaining picks indicator, disabled checkboxes with tooltips explaining constraints
- [x] **UI polish: MCQ code formatting** — Code blocks rendered with syntax highlighting in student MCQ view
- [x] **Timer drift/accuracy audit** — Backend now authoritative; timer check at submit prevents manipulation
- [x] **Deployment** — Docker Compose with production overlay, HTTPS-ready nginx config, SSL setup script, deploy script

---

## Nice-to-Have (Future Expansion — section 10 of spec)

### Gamification & Student Engagement

- [ ] **XP & Leveling System** — Award XP for completing tests, streak milestones, and daily challenges; each level unlocks cosmetic rewards (badge next to name, profile themes).
- [ ] **Multi-Period Leaderboards** — Per-test, weekly, and all-time leaderboards filterable by class, batch, or overall; highlight top 3 with podium styling and show the student's own rank relative to peers.
- [ ] **Achievement Badges** — Auto-award badges for milestones (first test, 90%+ score, 7-day streak, solved 3 hard coding problems), displayed on a public achievements wall in the student profile.
- [ ] **Streak Tracking** — Track consecutive days a student attempts at least one MCQ or coding practice; show a heatmap calendar and grant bonus XP for maintaining streaks (e.g., +5 XP/day, +50 at 7 days).
- [ ] **Daily Challenge Question** — A fresh MCQ or short coding problem available once per day per student; awards bonus XP and a unique badge when completed, resets at midnight server time.
- [ ] **Student Progress Dashboard** — Dedicated student-facing analytics page with radar charts per genre, XP history line graph, practice hours breakdown, and a checklist showing remaining achievement badges.
- [ ] **Mock Interview Mode** — Timed mock interview flow with mixed MCQ + coding rounds and a simulated "interviewer" timer countdown; results include a mock scorecard with section-wise feedback and suggested areas to improve.
- [ ] **Study Resource Library** — Curated collection of topic-wise notes, video links, and practice problem sets tied to each question genre; students can mark resources as completed and track study hours.

### Student Experience & Self-Service

- [ ] **Student profile / portfolio page** — Resume/CV upload, editable skills list with proficiency tags, project showcases, and GitHub/linkedIn links; visible to admin during review
- [ ] **Practice / drill mode** — Untimed, topic-specific MCQ drills with instant answer feedback and explanations; no scoring pressure, just learning
- [ ] **Performance history & trend charts** — Per-student dashboard with line charts for score/marks/accuracy over time, genre-wise radar breakdowns, and improvement tracking
- [ ] **Bookmark & review questions** — Allow students to flag MCQs during a test for later review; collate all bookmarked questions post-test for self-study
- [ ] **Test attempt history with detailed review** — Paginated list of past attempts; each entry opens a read-only review showing selected answers, correct answers, marks awarded, and coding solution code
- [ ] **Compare performance with batch averages** — After results are published, show each student a bar chart comparing their score, genre-wise accuracy, and coding marks against the batch mean and topper
- [ ] **Student feedback on questions** — Allow students to report broken or incorrect MCQs (wrong answer key, ambiguous wording, formatting issues) with a comment; admin receives flagged items in a moderation queue
- [ ] **Dark mode / theme customization** — Toggle between light, dark, and high-contrast themes persisted in localStorage or user preferences on the backend

### Platform Expansion

- [x] Custom-built code execution engine (replace Judge0) — Enhanced Docker-based runner with queue system, compilation support, removed Judge0 dependency
- [x] Individual student drill-down analytics — New `/users/:id/analytics` endpoint with genre accuracy, coding perf, test history; frontend page at `/admin/analytics/students/:id`
- [x] Dedicated "drive" abstraction with proper DB table — New `drives`, `drive_tests`, `drive_batches` tables; full CRUD controller/routes; frontend management page at `/admin/drives`
- [x] Automated email notifications (drive reminders, result announcements) — Built-in scheduler (`services/scheduler.js`) checks every 15min for upcoming drives and recent test completions, sends emails via existing Nodemailer templates
- [x] Question difficulty analytics (flagging consistently-incorrect MCQs) — New `GET /api/submissions/question-analytics` endpoint; frontend page with threshold slider at `/admin/analytics/questions`
- [x] Plagiarism/similarity detection across code submissions — New `GET /api/submissions/plagiarism-check/:testId` endpoint with Jaccard + Levenshtein similarity; frontend page at `/admin/analytics/plagiarism`

### AI/ML & Intelligent Features

- [ ] **AI-Generated MCQ Questions** — Automatically generate multiple-choice questions from uploaded syllabus PDFs or topic keywords using LLMs, saving instructors manual effort and ensuring curriculum coverage.
- [ ] **AI-Powered Coding Hints** — Provide context-aware, progressive hints for coding problems that adapt to the student's current solution, helping without giving away the answer.
- [ ] **Adaptive Difficulty Tuning** — Use ML to adjust question difficulty in real time based on a student's previous answers, creating a personalized assessment path.
- [ ] **Automated Question Tagging** — Classify questions by topic, difficulty, and cognitive level (Bloom's taxonomy) using NLP, enabling smart filtering and balanced test creation.
- [ ] **AI Performance Feedback** — Generate natural-language summaries for each student after a test, highlighting strengths, weak areas, and recommended topics to revise.
- [ ] **Keystroke & Answer-Similarity Cheating Detection** — Flag suspicious behavior by analyzing answer submission timing, keystroke patterns, and pairwise answer similarity across the cohort.
- [ ] **Placement Prediction Analytics** — Train a model on historical student data (CGPA, test scores, soft skills) to predict which students are likely to get placed and recommend interventions.
- [ ] **Natural Language Report Query** — Let instructors ask plain-English questions like "show me students who scored >80% in aptitude" and get instant filtered results without navigating complex dashboard filters.

### Security, Anti-Cheating & Integrity

- [ ] **Webcam Proctoring & Snapshot Logging** — Capture periodic webcam snapshots during the test session and flag frames where the student's face is absent, multiple faces are detected, or gaze deviates from the screen for extended periods.
- [ ] **Full-Screen Enforcement & Focus Tracking** — Use the Fullscreen API to lock the browser into full-screen mode during the exam and log visibilitychange/blur events as suspected tab-switch attempts, automatically submitting the paper after a configurable threshold.
- [ ] **Randomized Question & Option Shuffling** — Assign each student a unique permutation of questions and a separate shuffle of answer options within each MCQ, making it near-impossible for adjacent test-takers to share or compare answers in real time.
- [ ] **Browser Lockdown & Clipboard Restrictions** — Disable right-click, text selection, copy/paste, and common developer-tool shortcuts (F12, Ctrl+Shift+I, Ctrl+U) across the entire test interface.
- [ ] **Device Fingerprinting & Session Binding** — Generate a unique device fingerprint (screen resolution, installed fonts, WebGL renderer, timezone, IP) at test start and rebind it periodically, automatically invalidating the session if the fingerprint changes mid-exam.
- [ ] **Plagiarism Detection for Code Submissions (MOSS Integration)** — Pipe all submitted code solutions through Stanford's MOSS (Measure Of Software Similarity) after each round, surfacing pairwise similarity scores with highlighted matched passages directly in the admin dashboard.
- [ ] **Time-Bomb Questions with Variable Exposure** — Mark certain high-weight questions to auto-disappear after a fixed countdown (e.g., 45 seconds), and track whether the student viewed or skipped the question before it vanished.
- [ ] **Suspicious-Activity Alert Feed for Admins** — Aggregate all integrity signals (face missing, tab-switch, IP drift, paste attempt, DevTools open) into a real-time scrollable feed on the admin dashboard, colour-coded by severity, with one-click disqualification and session-kill.

### Communication, Notifications & Collaboration

- [ ] **Real-time WebSocket notifications** — In-app live feed for test start alerts, submission confirmations, score updates, and admin announcements using the existing WebSocket infrastructure.
- [ ] **Email/SMS push notifications** — Automated reminders for upcoming tests, results publication, and password resets via Nodemailer/Twilio integration.
- [ ] **Student-to-admin messaging during tests** — Embedded chat panel for reporting issues (ambiguous questions, platform bugs) without leaving the exam interface.
- [ ] **Announcement board / news feed** — Persistent scrolling feed on the student dashboard displaying placement drives, deadlines, and admin notices with priority pins.
- [ ] **Calendar sync (Google/Outlook)** — One-click "Add to Calendar" for scheduled tests and interviews, including ICS file generation or OAuth-based sync.
- [ ] **Weekly email digest** — Auto-generated Sunday summary containing performance trends, upcoming tests, leaderboard rank change, and pending actions.
- [ ] **Discussion forum for coding problems** — Thread-based Q&A panel under each coding question where students can share approaches (post-review) and upvote answers.

### Advanced Analytics & Reporting

- [ ] **Cohort Performance Analytics** — Compare placement readiness across batches, years, and departments with side-by-side radar charts, percentile distributions, and statistical significance indicators.
- [ ] **Student Growth Trajectories** — Track individual progress across multiple mock tests with trend lines, percentile rank history, and skill-mastery curves broken down by subject/genre.
- [ ] **Topic Difficulty & Discrimination Heatmap** — Per-question analytics showing difficulty index, discrimination index, and distractor efficiency, surfaced as a color-coded matrix for test designers.
- [ ] **Question Time-Sink Analysis** — Identify questions where students spend disproportionately long time with low accuracy, flagging ambiguous wording or misplaced difficulty.
- [ ] **Predictive Placement Probability** — ML-light model that computes each student's likelihood of being placed based on historical mock performance, company cutoffs, and peer benchmarks.
- [ ] **Custom Report Builder with Drill-Down** — Exportable (PDF/CSV) multi-section reports where users select metrics, filters, and date ranges, with clickable roll-ups from aggregate class view to individual student cards.
- [ ] **Scheduled Auto-Reports & Alerts** — Email or Slack delivery of weekly/fortnightly PDF snapshots with trend commentary, plus threshold-based alerts when a student's performance drops significantly below their baseline.
- [ ] **Natural Language Insight Summaries** — Auto-generated prose summaries of key takeaways (e.g., "CSE 2025 batch improved 12% in DP problems but slipped 5% in OS") alongside the charts for quick consumption by faculty.

### Coding Platform Enhancements

- [ ] **Multi-language Runtime Expansion** — Support JavaScript (Node.js), Go, Rust, Ruby, and Kotlin runners alongside existing compilers, with per-language dependency caching to speed up cold starts.
- [ ] **Custom Sandboxed Execution Engine** — Replace Judge0 with a lightweight, self-hosted gVisor/Firecracker-based sandbox built on top of containerized per-language workers, reducing latency and operational cost.
- [ ] **Code Playback Timeline** — Record every keystroke and paste event during a coding session; replay the student's edit history as a scrubbable video-like timeline for plagiarism analysis and feedback.
- [ ] **In-editor IntelliSense & Linting** — Integrate Monaco editor with Language Server Protocol (LSP) clients for each language, providing real-time auto-complete, hover docs, diagnostics, and go-to-definition.
- [ ] **One-click Code Formatter** — Add a format action that runs Prettier/d fmt/rustfmt via the language runtime, normalizing student code before submission and ensuring consistent admin review.
- [ ] **Multi-file Coding Problem Workspace** — Allow problems with a project scaffold (multiple files, package.json, go.mod), auto-detecting the entry point and running a custom test command against the full workspace.
- [ ] **Code Quality & Complexity Analysis** — After submission, run static analysis (linters, cyclomatic complexity, LOC, comment ratio) and surface a readability score to both student and admin alongside the verdict.
- [ ] **Custom Test Case Explorer** — Let students author and run their own test cases against hidden problem stubs before final submission, with diff output and runtime logging to aid debugging.

### Third-Party Integrations & APIs

- [ ] **Single Sign-On (SSO / SAML / LDAP)** — Allow colleges to authenticate via enterprise identity providers (Azure AD, Okta, OneLogin) so students and admins log in with their institutional credentials.
- [ ] **LMS Integration (Moodle, Canvas, Blackboard)** — Sync student rosters, course schedules, and assessment scores directly from the college's learning management system to eliminate duplicate data entry.
- [ ] **ATS Integration (Greenhouse, Lever)** — Enable recruiters to push shortlisted candidates' coding assessment results and scores into their applicant tracking system with one click.
- [ ] **Calendar Sync (Google Calendar / Outlook)** — Automatically create calendar events for scheduled mock interviews, tests, and deadlines so students never miss an assessment window.
- [ ] **Slack / Discord Webhook Notifications** — Notify students and faculty in real-time via team chat channels when test results are published, schedules change, or coding submissions are evaluated.
- [ ] **Zoom / Google Meet API Integration** — Generate and embed video-conference links directly into interview slots so students and interviewers join without leaving the platform.
- [ ] **Payment Gateway (Razorpay / Stripe)** — Support paid mock tests by processing one-time payments or subscriptions, with automatic receipt generation and seat confirmation.
- [ ] **SMS Gateway (Twilio)** — Send time-sensitive reminders (test start alerts, result available, schedule changes) via SMS for students who opt in, improving attendance and engagement.

### Mobile Experience & UX Polish

- [ ] **Native Mobile App (React Native)** — Build a companion mobile app for iOS and Android using React Native, enabling students to attempt tests, view results, and receive push notifications directly on their phones.
- [ ] **Progressive Web App with Offline Support** — Add a service worker and cache-first strategy so students can download tests while online and attempt them later without internet connectivity, with automatic sync when reconnected.
- [ ] **Touch-Optimized Tablet Interface** — Redesign the test-taking UI for tablets with larger touch targets, swipe-to-navigate between questions, and a side-by-side split view for coding questions.
- [ ] **Dyslexia-Friendly Mode & Font Size Controls** — Offer a toggleable OpenDyslexic font, adjustable base font size (sm/md/lg/xl), and a reading ruler overlay to improve comprehension for neurodivergent students during timed tests.
- [ ] **Onboarding Tutorial for New Students** — A step-by-step interactive walkthrough on first login that explains the test flow, code editor basics, marking for review, and result interpretation.
- [ ] **Customizable Dashboard Widgets** — Let students pin, reorder, and resize widgets on their dashboard (upcoming tests, past scores, weak topics, leaderboard rank) via a drag-and-drop grid layout.

### Multi-Tenancy, Enterprise & White-Labeling

- [ ] **Multi-College / Multi-Tenant Architecture** — Isolate all data (students, tests, results) per college via a tenant context, enabling a single deployment to serve hundreds of independent institutions with zero data leakage.
- [ ] **White-Label Branding per Tenant** — Each college can upload its own logo, choose accent colors, and customize the platform's favicon, login page, and email footers so students see their institution's identity.
- [ ] **Custom Domains & Subdomains** — Map a unique subdomain (e.g., mit.platform.com) or a fully custom domain (exam.mit.edu) to each tenant, with automatic TLS certificate provisioning.
- [ ] **Granular RBAC with Role Hierarchies** — Define roles beyond Admin/User: Department Admin (manage own dept tests), Proctor (monitor live exams, flag cheaters), and Auditor (read-only access to logs and results).
- [ ] **Sub-Admin & Proctor Dashboards** — Department-level admins invite proctors who can view real-time candidate progress, force-terminate a test, and download room-wise attendance reports — without accessing other departments.
- [ ] **Audit Trail & Compliance Reporting** — Immutable log of every admin action (login, test edit, grade override, user export) with a searchable viewer UI, plus exportable reports for accreditation bodies.
- [ ] **Usage Quotas & Billing Meters** — Track active students, tests created, storage used, and API calls per tenant; show live usage in a console and enforce soft/hard caps based on subscription tier.

### Accessibility, Internationalization & Localization

- [ ] **Multi-language UI (i18n)** — Add full internationalization support for Hindi and 3-5 regional languages using react-i18next, with language persistence and seamless switching during a live test session.
- [ ] **WCAG 2.1 AA/AAA audit & remediation** — Conduct a systematic accessibility audit against WCAG 2.1 AA (targeting AAA where feasible) and fix contrast ratios, focus indicators, aria labels, form associations, and error announcements across all user-facing routes.
- [ ] **Screen-reader-optimized test interface** — Refactor the MCQ and coding test views to expose live region announcements for question changes, timer warnings, answer selection, and submission confirmations.
- [ ] **RTL language support** — Add full right-to-left layout mirroring for Urdu, Arabic, and Kashmiri, flipping the entire UI grid, text alignment, icon ordering, and input direction without layout breakage.
- [ ] **Bilingual question mode** — Allow MCQ questions to carry parallel content in English and a selected regional language, displayed side-by-side or via a toggle.
- [ ] **Reduced motion mode** — Respect the prefers-reduced-motion media query and disable all non-essential animations while keeping critical progress indicators intact.

### Content Management & Question Bank Enhancements

- [ ] **Rich Text & LaTeX Editor** — Integrate a WYSIWYG editor with full LaTeX math equation support so questions can include complex formulas, matrices, and scientific notation natively.
- [ ] **Question Tagging with Learning Objectives** — Tag each question with skills, topics, and learning outcomes (e.g., Bloom's taxonomy levels) to enable outcome-aligned test generation and student gap analysis.
- [ ] **Question Difficulty Calibration (IRT)** — Apply Item Response Theory to auto-calibrate question difficulty, discrimination, and guessability based on historical student performance data.
- [ ] **Collaborative Authoring & Approval Workflow** — Support multi-admin question creation with draft → review → publish states, version history, and role-based permissions to prevent unreviewed content from going live.
- [ ] **Parameterized & Template Questions** — Define question templates with variable placeholders (numbers, expressions) so each student receives a unique variant, reducing answer-sharing during live exams.
- [ ] **Question Feedback & Rating** — Let students rate question clarity, difficulty, and relevance after practice sessions, surfacing confusing or poorly-worded questions for admin review.

### Admin Workflow & Productivity

- [ ] **Bulk operations (delete, archive, move tests)** — Multi-select UI for tests, questions, and students with batch actions to reduce repetitive manual work.
- [ ] **Test templates / cloning with presets** — Save test configurations (sections, timers, scoring rules) as reusable templates for quick creation of similar assessments.
- [ ] **Scheduled test publishing** — Set a future date/time for a test to automatically transition from draft to published, eliminating manual launch.
- [ ] **Two-factor authentication for admins** — Add TOTP-based 2FA for all admin accounts to protect against credential compromise.
- [ ] **Test preview as student** — Allow admins to preview any test exactly as a student would see it, verifying question rendering, timer behavior, and flow before publishing.
- [ ] **Question version history** — Track changes to MCQ and coding questions over time with the ability to diff and revert to previous versions.

### Compliance, Audit & Data Governance

- [ ] **GDPR Data Subject Access Request UI** — Allow students to request a downloadable copy of all personally identifiable data stored on the platform, fulfilling the right to data portability.
- [ ] **Automated Data Retention & Purging Engine** — Configurable retention policies per data category (test submissions, session logs, PII) with a scheduled job that soft-deletes or anonymizes records beyond the retention window.
- [ ] **Immutable Admin Audit Trail** — Append-only log of all admin actions (user impersonation, grade overrides, config changes) keyed to an admin identity and timestamp, optionally backed by a SHA-256 hash chain for tamper-evidence.
- [ ] **Right-to-Be-Forgotten Workflow** — One-click student data erasure that cascade-deletes or anonymizes test results, session data, and derived analytics while preserving aggregate statistics.
- [ ] **Admin Session Manager & Revocation UI** — Dashboard showing all active admin sessions with device/browser fingerprint, IP geolocation, and a one-click revoke button to force-logout any suspicious session.
- [ ] **Student Consent Management Portal** — Granular opt-in/opt-out toggles for data processing purposes (analytics, profiling, third-party sharing) with timestamped consent records.
- [ ] **Encryption-at-Rest Audit Dashboard** — Visibility panel showing which database columns and file attachments are encrypted (AES-256), with key rotation age and a compliance health score for SOC2 / ISO 27001 readiness.

### Infrastructure, DevOps & Scalability

- [ ] **CI/CD Pipeline (GitHub Actions)** — Run lint, type-check, and a subset of Playwright E2E tests on every push; on merge to `main`, build Docker images and deploy to staging/production via SSH or Docker Compose hook.
- [ ] **Database Backup Automation** — Scheduled `pg_dump` via cron inside the PostgreSQL container (or a sidecar) with S3/cloud-storage upload; retain last 7 daily + 4 weekly backups with a simple rotation script.
- [ ] **Read Replicas for PostgreSQL** — Offload dashboard aggregate queries, CSV exports, and analytics reads to a read replica; configure Prisma to route read operations to the replica URL while writes go to the primary.
- [ ] **Monitoring & Alerting Stack** — Deploy Prometheus (metrics collection) + Grafana (dashboards for request rate, p99 latency, DB connection pool, Judge0 queue depth) + Sentry (error tracking for both backend and frontend) with PagerDuty or Slack alert notifications.
- [ ] **Structured Logging Aggregation (Loki + Promtail)** — Replace raw `console.log` with structured JSON logging (correlation IDs, request duration, DB query timing); ship logs via Promtail to Loki and build Grafana panels for error rate, slow queries, and 5xx trends.
- [ ] **Horizontal Scaling of Backend Instances** — Statelessify the Express backend (session store to Redis, file uploads to S3-compatible storage); run multiple replicas behind nginx reverse-proxy with round-robin load balancing for concurrent test-taking capacity.
- [ ] **API Documentation (Swagger/OpenAPI)** — Annotate all backend routes with Zod-to-OpenAPI conversion or JSDoc decorators; serve a Swagger UI at `/api-docs` enabling students/admins to test endpoints and auto-generate a TypeScript client.
- [ ] **Blue-Green Deployment Strategy** — Maintain two production environments (blue and green) behind the reverse proxy; deploy new version to the inactive environment, run smoke tests, then flip traffic with zero downtime and instant rollback capability.
