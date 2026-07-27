/**
 * CampusTrack Load / Stress Test
 * ─────────────────────────────────────────────────────────────
 * Simulates N concurrent students taking a live test end-to-end
 * (login session → list tests → start → autosave × k → submit)
 * against a running instance of the backend, and produces a
 * pass/fail report with latency percentiles and error breakdowns.
 *
 * Usage:
 *   cd backend
 *   node scripts/stresstest.js
 *   node scripts/stresstest.js --users=300 --stagger-ms=5000
 *   node scripts/stresstest.js --test-id=<uuid>   # load-test a real test instead of a throwaway one
 *   node scripts/stresstest.js --keep-data         # don't delete the synthetic users/test afterwards
 *
 * What it does NOT do:
 *   - It does not go through /api/auth/login for all N users. authLimiter
 *     caps login attempts at 20 per 15 minutes PER IP, so simulating 180
 *     logins from one machine would just measure the rate limiter, not
 *     the app. Instead it mints JWTs directly (same secret/shape the
 *     server signs with) — modelling the realistic case where students
 *     log in over the preceding minutes and the exam start is what's
 *     actually concurrent. Pass --include-login-sample=N to additionally
 *     sanity-check the real /auth/login path with a small sample.
 *
 * Flags:
 *   --users=180            number of simulated concurrent students
 *   --base-url=http://localhost:5000
 *   --stagger-ms=3000      max random jitter before each user starts (models imperfect sync)
 *   --saves=3              number of autosave calls per user during the test
 *   --test-id=<uuid>       use an existing published test instead of creating one
 *   --keep-data            skip cleanup of synthetic users/test/submissions afterwards
 *   --include-login-sample=N   also exercise real /auth/login for N of the users
 *   --report-dir=./reports
 *   --max-error-rate=2     verdict threshold: overall error rate percent
 *   --max-p95-ms=4000      verdict threshold: p95 latency for the submit step
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { query, pool } = require('../src/db');

// ── CLI args ──────────────────────────────────────────────────
function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}
const args = parseArgs();

const NUM_USERS = parseInt(args.users || '180', 10);
const BASE_URL = (args['base-url'] || process.env.STRESS_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const STAGGER_MS = parseInt(args['stagger-ms'] || '3000', 10);
const NUM_SAVES = parseInt(args.saves || '3', 10);
const EXISTING_TEST_ID = args['test-id'] || null;
const KEEP_DATA = !!args['keep-data'];
const LOGIN_SAMPLE = parseInt(args['include-login-sample'] || '0', 10);
const REPORT_DIR = args['report-dir'] || path.join(__dirname, '..', 'reports');
const MAX_ERROR_RATE_PCT = parseFloat(args['max-error-rate'] || '2');
const MAX_P95_SUBMIT_MS = parseInt(args['max-p95-ms'] || '4000', 10);

const STRESS_EMAIL_PREFIX = 'stressuser_';
const STRESS_EMAIL_DOMAIN = '@stresstest.local';
const STRESS_PASSWORD = 'StressTest@123';
const STRESS_TEST_TITLE = '__STRESS_TEST__ (safe to delete)';

const http = axios.create({ baseURL: BASE_URL, timeout: 20000, validateStatus: () => true });

// ── Metrics ───────────────────────────────────────────────────
const metrics = {}; // { endpoint: { latencies: [], ok: 0, fail: 0, statusCodes: {} } }

function record(endpoint, ms, status, ok) {
  if (!metrics[endpoint]) metrics[endpoint] = { latencies: [], ok: 0, fail: 0, statusCodes: {} };
  const m = metrics[endpoint];
  m.latencies.push(ms);
  if (ok) m.ok += 1; else m.fail += 1;
  m.statusCodes[status] = (m.statusCodes[status] || 0) + 1;
}

async function timedRequest(endpoint, fn) {
  const start = Date.now();
  try {
    const res = await fn();
    const ms = Date.now() - start;
    const ok = res.status >= 200 && res.status < 300;
    record(endpoint, ms, res.status, ok);
    return { ok, status: res.status, data: res.data, ms };
  } catch (err) {
    const ms = Date.now() - start;
    const status = err.code === 'ECONNABORTED' ? 'TIMEOUT' : (err.code || 'NETWORK_ERROR');
    record(endpoint, ms, status, false);
    return { ok: false, status, data: null, ms };
  }
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(latencies) {
  if (!latencies.length) return { min: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  const sum = latencies.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...latencies),
    avg: Math.round(sum / latencies.length),
    p50: percentile(latencies, 50),
    p90: percentile(latencies, 90),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: Math.max(...latencies),
  };
}

// ── Setup: throwaway test + questions ────────────────────────
async function ensureStressTest() {
  if (EXISTING_TEST_ID) {
    const { rows } = await query('SELECT * FROM tests WHERE id=$1', [EXISTING_TEST_ID]);
    if (!rows[0]) throw new Error(`--test-id ${EXISTING_TEST_ID} not found`);
    console.log(`Using existing test: "${rows[0].title}" (${rows[0].id})`);
    return { test: rows[0], createdByScript: false };
  }

  const { rows: existing } = await query(
    "SELECT * FROM tests WHERE title=$1 AND status='published' ORDER BY created_at DESC LIMIT 1",
    [STRESS_TEST_TITLE]
  );
  if (existing[0]) {
    console.log(`Reusing previously-created stress test (${existing[0].id})`);
    return { test: existing[0], createdByScript: true };
  }

  const now = new Date();
  const start = new Date(now.getTime() - 60 * 1000);
  const end = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  const { rows: [test] } = await query(
    `INSERT INTO tests (title, description, status, start_time, end_time, duration_minutes, department, settings)
     VALUES ($1,$2,'published',$3,$4,$5,$6,'{}') RETURNING *`,
    [STRESS_TEST_TITLE, 'Auto-generated by stresstest.js', start, end, 90, 'General']
  );

  const { rows: [section] } = await query(
    `INSERT INTO sections (test_id, name, type, order_index) VALUES ($1,'Aptitude','aptitude',0) RETURNING *`,
    [test.id]
  );

  const sampleQuestions = [
    { text: 'What is 2 + 2?', options: ['2', '3', '4', '5'], correct: '4' },
    { text: 'Capital of France?', options: ['Berlin', 'Madrid', 'Paris', 'Rome'], correct: 'Paris' },
    { text: 'HTML stands for?', options: ['HyperText Markup Language', 'HighText Machine Language', 'Hyperloop', 'None'], correct: 'HyperText Markup Language' },
    { text: '5 * 6 = ?', options: ['11', '30', '56', '65'], correct: '30' },
    { text: 'Which is a programming language?', options: ['HTTP', 'Python', 'HTML', 'FTP'], correct: 'Python' },
  ];
  for (let i = 0; i < sampleQuestions.length; i++) {
    const q = sampleQuestions[i];
    await query(
      `INSERT INTO questions (section_id, type, text, options, correct_answer, marks, order_index)
       VALUES ($1,'mcq',$2,$3,$4,2,$5)`,
      [section.id, q.text, JSON.stringify(q.options), JSON.stringify(q.correct), i]
    );
  }

  console.log(`Created throwaway stress test (${test.id}) with 5 MCQ questions`);
  return { test, createdByScript: true };
}

async function ensureStressUsers(n) {
  console.log(`Ensuring ${n} stress-test student accounts exist...`);
  const passwordHash = await bcrypt.hash(STRESS_PASSWORD, 10);
  const users = [];
  // Batch this in chunks to avoid one giant query
  const CHUNK = 50;
  for (let start = 0; start < n; start += CHUNK) {
    const chunkSize = Math.min(CHUNK, n - start);
    const values = [];
    const params = [];
    for (let i = 0; i < chunkSize; i++) {
      const idx = start + i;
      const email = `${STRESS_EMAIL_PREFIX}${String(idx).padStart(4, '0')}${STRESS_EMAIL_DOMAIN}`;
      const p = params.length;
      values.push(`($${p + 1},$${p + 2},$${p + 3},'student',true)`);
      params.push(`Stress User ${idx}`, email, passwordHash);
    }
    await query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ${values.join(',')}
       ON CONFLICT (email) DO NOTHING`,
      params
    );
  }

  const emails = Array.from({ length: n }, (_, i) => `${STRESS_EMAIL_PREFIX}${String(i).padStart(4, '0')}${STRESS_EMAIL_DOMAIN}`);
  const { rows } = await query(
    `SELECT id, email, role FROM users WHERE email = ANY($1::text[])`,
    [emails]
  );
  console.log(`${rows.length}/${n} stress-test accounts ready`);
  return rows;
}

function mintToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// ── Per-user simulated exam flow ─────────────────────────────
function randomAnswers(questionIds, options) {
  const answers = {};
  for (const qid of questionIds) {
    const opts = options[qid] || [];
    answers[qid] = opts.length ? opts[Math.floor(Math.random() * opts.length)] : '';
  }
  return answers;
}

async function runUser(user, testId, questionIds, optionsByQuestion) {
  const jitter = Math.floor(Math.random() * STAGGER_MS);
  await new Promise((r) => setTimeout(r, jitter));

  const token = mintToken(user.id, user.role);
  const authHeader = { Authorization: `Bearer ${token}` };

  const listRes = await timedRequest('GET /api/tests', () =>
    http.get('/api/tests', { headers: authHeader })
  );
  if (!listRes.ok) return; // can't proceed meaningfully without this

  const startRes = await timedRequest('POST /api/submissions/start', () =>
    http.post('/api/submissions/start', { testId }, { headers: authHeader })
  );
  if (!startRes.ok) return;

  let lastAnswers = {};
  for (let i = 0; i < NUM_SAVES; i++) {
    await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 600)));
    lastAnswers = randomAnswers(questionIds, optionsByQuestion);
    await timedRequest('POST /api/submissions/save', () =>
      http.post('/api/submissions/save', { testId, answers: lastAnswers }, { headers: authHeader })
    );
  }

  await timedRequest('POST /api/submissions/submit', () =>
    http.post('/api/submissions/submit', { testId, answers: lastAnswers }, { headers: authHeader })
  );
}

async function runLoginSample(users) {
  const sample = users.slice(0, Math.min(LOGIN_SAMPLE, users.length));
  console.log(`\nSanity-checking real /api/auth/login for ${sample.length} users (expect this to be rate-limited above 20/15min per IP)...`);
  for (const u of sample) {
    await timedRequest('POST /api/auth/login (sample)', () =>
      http.post('/api/auth/login', { email: u.email, password: STRESS_PASSWORD })
    );
  }
}

// ── Cleanup ───────────────────────────────────────────────────
async function cleanup(users, test, createdTest) {
  console.log('\nCleaning up synthetic data...');
  const userIds = users.map((u) => u.id);
  if (userIds.length) {
    await query('DELETE FROM submissions WHERE user_id = ANY($1::uuid[])', [userIds]);
    await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    console.log(`Removed ${userIds.length} stress-test users and their submissions`);
  }
  if (createdTest && test) {
    await query('DELETE FROM tests WHERE id=$1', [test.id]); // cascades sections/questions/submissions
    console.log(`Removed throwaway stress test (${test.id})`);
  }
}

// ── Report ────────────────────────────────────────────────────
function buildReport({ wallMs, users, test }) {
  const endpoints = Object.keys(metrics).map((name) => {
    const m = metrics[name];
    const total = m.ok + m.fail;
    return {
      name,
      total,
      ok: m.ok,
      fail: m.fail,
      errorRatePct: total ? +((m.fail / total) * 100).toFixed(2) : 0,
      statusCodes: m.statusCodes,
      latency: summarize(m.latencies),
    };
  });

  const totalReq = endpoints.reduce((a, e) => a + e.total, 0);
  const totalFail = endpoints.reduce((a, e) => a + e.fail, 0);
  const overallErrorRatePct = totalReq ? +((totalFail / totalReq) * 100).toFixed(2) : 0;
  const submitEndpoint = endpoints.find((e) => e.name === 'POST /api/submissions/submit');
  const submitP95 = submitEndpoint ? submitEndpoint.latency.p95 : 0;
  const has5xx = endpoints.some((e) => Object.keys(e.statusCodes).some((code) => /^5\d\d$/.test(code)));

  const verdictReasons = [];
  if (overallErrorRatePct > MAX_ERROR_RATE_PCT) verdictReasons.push(`overall error rate ${overallErrorRatePct}% > threshold ${MAX_ERROR_RATE_PCT}%`);
  if (submitP95 > MAX_P95_SUBMIT_MS) verdictReasons.push(`submit p95 ${submitP95}ms > threshold ${MAX_P95_SUBMIT_MS}ms`);
  if (has5xx) verdictReasons.push('one or more 5xx server errors observed');
  const verdict = verdictReasons.length ? 'FAIL' : 'PASS';

  return {
    generatedAt: new Date().toISOString(),
    config: { NUM_USERS, BASE_URL, STAGGER_MS, NUM_SAVES, testId: test.id },
    wallMs,
    totalRequests: totalReq,
    overallErrorRatePct,
    throughputRps: totalReq ? +(totalReq / (wallMs / 1000)).toFixed(2) : 0,
    verdict,
    verdictReasons,
    endpoints,
  };
}

function printReport(report) {
  console.log('\n' + '='.repeat(70));
  console.log(`STRESS TEST REPORT — ${report.config.NUM_USERS} concurrent users`);
  console.log('='.repeat(70));
  console.log(`Wall clock time:     ${(report.wallMs / 1000).toFixed(1)}s`);
  console.log(`Total requests:      ${report.totalRequests}`);
  console.log(`Overall error rate:  ${report.overallErrorRatePct}%`);
  console.log(`Throughput:          ${report.throughputRps} req/s`);
  console.log('');
  console.log('Per-endpoint latency (ms) and error rate:');
  console.log('-'.repeat(70));
  for (const e of report.endpoints) {
    console.log(`\n${e.name}`);
    console.log(`  requests=${e.total}  ok=${e.ok}  fail=${e.fail}  error_rate=${e.errorRatePct}%`);
    console.log(`  min=${e.latency.min} avg=${e.latency.avg} p50=${e.latency.p50} p90=${e.latency.p90} p95=${e.latency.p95} p99=${e.latency.p99} max=${e.latency.max}`);
    console.log(`  status codes: ${JSON.stringify(e.statusCodes)}`);
  }
  console.log('\n' + '='.repeat(70));
  console.log(`VERDICT: ${report.verdict}`);
  if (report.verdictReasons.length) {
    report.verdictReasons.forEach((r) => console.log(`  - ${r}`));
  }
  console.log('='.repeat(70) + '\n');
}

function writeReportFiles(report) {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const ts = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(REPORT_DIR, `stresstest-${ts}.json`);
  const mdPath = path.join(REPORT_DIR, `stresstest-${ts}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  let md = `# Stress Test Report\n\n`;
  md += `- Generated: ${report.generatedAt}\n`;
  md += `- Concurrent users: ${report.config.NUM_USERS}\n`;
  md += `- Base URL: ${report.config.BASE_URL}\n`;
  md += `- Wall clock: ${(report.wallMs / 1000).toFixed(1)}s\n`;
  md += `- Total requests: ${report.totalRequests}\n`;
  md += `- Overall error rate: ${report.overallErrorRatePct}%\n`;
  md += `- Throughput: ${report.throughputRps} req/s\n`;
  md += `- **Verdict: ${report.verdict}**\n`;
  if (report.verdictReasons.length) {
    md += `\nReasons:\n` + report.verdictReasons.map((r) => `- ${r}`).join('\n') + '\n';
  }
  md += `\n## Per-endpoint results\n\n`;
  md += `| Endpoint | Requests | Fail | Error % | avg | p50 | p90 | p95 | p99 | max |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const e of report.endpoints) {
    md += `| ${e.name} | ${e.total} | ${e.fail} | ${e.errorRatePct}% | ${e.latency.avg} | ${e.latency.p50} | ${e.latency.p90} | ${e.latency.p95} | ${e.latency.p99} | ${e.latency.max} |\n`;
  }
  fs.writeFileSync(mdPath, md);

  console.log(`Report written to:\n  ${jsonPath}\n  ${mdPath}`);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`CampusTrack stress test — ${NUM_USERS} users against ${BASE_URL}`);

  const healthBefore = await timedRequest('GET /health (pre-check)', () => http.get('/health'));
  if (!healthBefore.ok) {
    console.error(`❌ Server did not respond healthy at ${BASE_URL}/health before the test even started (status=${healthBefore.status}). Aborting.`);
    process.exit(1);
  }

  const { test, createdByScript } = await ensureStressTest();
  const { rows: sections } = await query('SELECT * FROM sections WHERE test_id=$1', [test.id]);
  const { rows: questions } = await query(
    'SELECT id, options FROM questions WHERE section_id = ANY($1::uuid[])',
    [sections.map((s) => s.id)]
  );
  if (!questions.length) {
    console.error('❌ Target test has no aptitude questions to answer — pass --test-id for a test with questions, or omit --test-id to let the script create its own.');
    process.exit(1);
  }
  const questionIds = questions.map((q) => q.id);
  const optionsByQuestion = {};
  for (const q of questions) optionsByQuestion[q.id] = q.options || [];

  const users = await ensureStressUsers(NUM_USERS);
  if (!users.length) {
    console.error('❌ No stress-test users available.');
    process.exit(1);
  }

  if (LOGIN_SAMPLE > 0) await runLoginSample(users);

  console.log(`\nLaunching ${users.length} simulated users (jitter up to ${STAGGER_MS}ms, ${NUM_SAVES} autosaves each)...`);
  const wallStart = Date.now();
  await Promise.allSettled(users.map((u) => runUser(u, test.id, questionIds, optionsByQuestion)));
  const wallMs = Date.now() - wallStart;
  console.log(`Load phase complete in ${(wallMs / 1000).toFixed(1)}s`);

  const healthAfter = await timedRequest('GET /health (post-check)', () => http.get('/health'));
  console.log(`Post-test health check: ${healthAfter.ok ? '✅ still up' : `❌ status=${healthAfter.status}`}`);

  const report = buildReport({ wallMs, users, test });
  printReport(report);
  writeReportFiles(report);

  if (!KEEP_DATA) {
    await cleanup(users, test, createdByScript && !EXISTING_TEST_ID);
  } else {
    console.log('--keep-data set: leaving synthetic users/test/submissions in place for inspection.');
  }

  await pool.end();
  process.exit(report.verdict === 'PASS' ? 0 : 2);
}

main().catch((err) => {
  console.error('Stress test crashed:', err);
  process.exit(1);
});
