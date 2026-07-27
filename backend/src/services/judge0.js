const axios = require('axios');
const logger = require('./logger');

// ── Language ID mapping (Judge0 CE language table) ──────────────
const LANGUAGE_IDS = {
  python:     71,   // Python 3.8.1
  javascript: 63,   // Node.js 12.14.0
  java:       62,   // OpenJDK 13.0.1
  cpp:        54,   // GCC 9.2.0 (C++17)
  c:          50,   // GCC 9.2.0
  go:         60,   // Go 1.13.5
  rust:       73,   // Rust 1.40.0
  ruby:       72,   // Ruby 2.7.0
  kotlin:     78,   // Kotlin 1.3.70
  sql:        82,   // SQL (SQLite 3.27.2)
};

// ── Client setup ─────────────────────────────────────────────────
// Self-hosted Judge0 (docker-compose, see infra/judge0/) needs no auth
// headers at all — just JUDGE0_API_URL (default http://localhost:2358).
// If you instead point this at RapidAPI's hosted Judge0, also set
// JUDGE0_API_KEY / JUDGE0_API_HOST and the headers below will be sent.
const isRapidApi = !!process.env.JUDGE0_API_KEY && !!process.env.JUDGE0_API_HOST;

const judge0Client = axios.create({
  baseURL: process.env.JUDGE0_API_URL || 'http://localhost:2358',
  headers: {
    'Content-Type': 'application/json',
    ...(isRapidApi
      ? {
          'X-RapidAPI-Key':  process.env.JUDGE0_API_KEY,
          'X-RapidAPI-Host': process.env.JUDGE0_API_HOST,
        }
      : {}),
  },
  timeout: 30000,
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Run a single piece of code against one stdin (kept for ad-hoc "Run" clicks,
 * where there's only one input and no need for batching).
 */
// SQL problems ship their schema + sample data as the test case's "input"
// and the student's query as their "code" (same convention used by the
// local Docker sandbox in services/sandbox.js). Judge0's SQL (SQLite)
// runner just executes source_code as one script with no separate
// schema-setup step, so we combine the two here and submit with empty
// stdin, keeping grading behavior identical across both providers.
function buildSubmissionSource(code, language, stdin) {
  if (language === 'sql' && stdin) return `${stdin}\n${code}`;
  return code;
}

async function runCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256000 }) {
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const isSql = language === 'sql';

  const { data: submission } = await judge0Client.post(
    '/submissions?base64_encoded=false&wait=false',
    {
      source_code:    buildSubmissionSource(code, language, stdin),
      language_id:    languageId,
      stdin:          isSql ? '' : stdin,
      cpu_time_limit: timeLimit,
      memory_limit:   memoryLimit * 1024, // MB → KB
    }
  );

  const token = submission.token;
  if (!token) throw new Error('No submission token received from Judge0');

  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const { data: result } = await judge0Client.get(`/submissions/${token}?base64_encoded=false`);
    if (result.status.id <= 2) continue; // 1 = In Queue, 2 = Processing

    return {
      status:        result.status.description,
      statusId:      result.status.id,
      stdout:        result.stdout || '',
      stderr:        result.stderr || '',
      compileOutput: result.compile_output || '',
      time:          result.time,
      memory:        result.memory,
      passed:        result.status.id === 3, // 3 = Accepted
    };
  }

  return { status: 'Time Limit Exceeded', statusId: 5, stdout: '', stderr: '', passed: false };
}

/**
 * Run code against every test case AT ONCE using Judge0's batch endpoint,
 * instead of looping one HTTP round-trip per test case. All test cases are
 * queued in a single request; Judge0's workers then pick them up and run
 * them in parallel (see infra/judge0/docker-compose.yml — COUNT sets how
 * many worker processes run concurrently).
 *
 * Falls back to running test cases one-by-one only if the batch endpoint
 * itself is unreachable (e.g. talking to an older Judge0 build).
 */
async function judgeSubmission({ code, language, testCases, timeLimit = 5, memoryLimit = 256000 }) {
  if (!Array.isArray(testCases) || testCases.length === 0) return [];

  const languageId = LANGUAGE_IDS[language];
  if (!languageId) {
    return testCases.map((tc) => ({
      status: 'Error', passed: false, error: `Unsupported language: ${language}`,
      input: tc.input, hidden: tc.isHidden || false,
    }));
  }

  const isSql = language === 'sql';
  const submissions = testCases.map((tc) => ({
    source_code:      buildSubmissionSource(code, language, tc.input),
    language_id:      languageId,
    stdin:            isSql ? '' : (tc.input || ''),
    expected_output:  tc.output != null ? String(tc.output) : undefined,
    cpu_time_limit:   timeLimit,
    memory_limit:     memoryLimit * 1024,
  }));

  let tokens;
  try {
    const { data } = await judge0Client.post('/submissions/batch?base64_encoded=false', { submissions });
    tokens = data.map((s) => s.token);
  } catch (err) {
    logger.error({ err: err.message }, 'Judge0 batch submit failed, falling back to sequential mode');
    return sequentialFallback({ code, language, testCases, timeLimit, memoryLimit });
  }

  const tokenParam = tokens.join(',');
  let submissionResults = [];

  // Poll the whole batch together (still one round-trip per poll, not one
  // per test case) until every submission is out of the queue, or ~30s pass.
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const { data } = await judge0Client.get('/submissions/batch', {
      params: {
        tokens: tokenParam,
        base64_encoded: false,
        fields: 'token,stdout,stderr,status_id,status,compile_output,time,memory',
      },
    });
    submissionResults = data.submissions;
    const stillRunning = submissionResults.some((s) => s.status.id <= 2);
    if (!stillRunning) break;
  }

  return submissionResults.map((result, idx) => {
    const tc = testCases[idx];
    const actualOutput = (result.stdout || '').trim();
    const expectedOutput = (tc.output || '').trim();
    return {
      status:        result.status.description,
      statusId:      result.status.id,
      stdout:        result.stdout || '',
      stderr:        result.stderr || '',
      compileOutput: result.compile_output || '',
      time:          result.time,
      memory:        result.memory,
      input:         tc.input,
      expected:      expectedOutput,
      actual:        actualOutput,
      // Judge0 already compares expected_output for us when it was supplied
      // (statusId 3 = Accepted, 4 = Wrong Answer); this is a defensive
      // second check in case expected_output was left blank.
      passed:        result.status.id === 3 && actualOutput === expectedOutput,
      hidden:        tc.isHidden || false,
    };
  });
}

/** Sequential one-request-per-test-case fallback (old behavior). */
async function sequentialFallback({ code, language, testCases, timeLimit, memoryLimit }) {
  const results = [];
  for (const tc of testCases) {
    try {
      const result = await runCode({ code, language, stdin: tc.input, timeLimit, memoryLimit });
      const actualOutput = (result.stdout || '').trim();
      const expectedOutput = (tc.output || '').trim();
      results.push({
        ...result,
        input: tc.input,
        expected: expectedOutput,
        actual: actualOutput,
        passed: result.passed && actualOutput === expectedOutput,
        hidden: tc.isHidden || false,
      });
    } catch (err) {
      results.push({ status: 'Error', passed: false, error: err.message, hidden: tc.isHidden || false });
    }
  }
  return results;
}

/** Simple reachability check, used by the runner provider switch below. */
async function isJudge0Available() {
  try {
    await judge0Client.get('/system_info', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

module.exports = { runCode, judgeSubmission, isJudge0Available, LANGUAGE_IDS };
