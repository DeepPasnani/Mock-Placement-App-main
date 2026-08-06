const axios = require('axios');
const http = require('http');
const logger = require('./logger');

const LANGUAGE_IDS = {
  python:     71,
  javascript: 63,
  java:       62,
  cpp:        54,
  c:          50,
  go:         60,
  ruby:       72,
  rust:       73,
  kotlin:     78,
  sql:        82,
};

const TIMEOUT = parseInt(process.env.CODEBOX_TIMEOUT, 10) || 30000;
const MAX_RETRIES = 2;

const codeboxClient = axios.create({
  baseURL: process.env.CODEBOX_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
    ...(process.env.CODEBOX_AUTH_TOKEN
      ? { 'X-Auth-Token': process.env.CODEBOX_AUTH_TOKEN }
      : {}),
  },
  timeout: TIMEOUT,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 200, scheduling: 'fifo' }),
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function outputsMatch(actual, expected, tolerance = 0) {
  if (expected === null || expected === undefined) return true;
  if (actual === null || actual === undefined) return false;

  const tokenize = (str) => String(str)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/[ \t\n\r]+/)
    .filter((tok) => tok.length > 0);

  const a = tokenize(actual);
  const b = tokenize(expected);

  if (a.length !== b.length) return false;

  const tol = Number(tolerance) || 0;
  for (let i = 0; i < a.length; i++) {
    if (tol > 0) {
      const na = Number(a[i]);
      const nb = Number(b[i]);
      if (Number.isFinite(na) && Number.isFinite(nb)) {
        if (Math.abs(na - nb) > tol) return false;
        continue;
      }
    }
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildSubmissionSource(code, language, stdin) {
  if (language === 'sql' && stdin) return `${stdin}\n${code}`;
  return code;
}

function toErrorWithStatus(err) {
  const status = err.response ? err.response.status : 'N/A';
  const detail = err.response?.data?.message || err.message;
  return new Error(`Codebox API error (HTTP ${status}): ${detail}`);
}

async function retryRequest(fn) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && !err.response) {
        logger.warn({ attempt: attempt + 1, err: err.message }, 'Codebox network error, retrying');
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw toErrorWithStatus(err);
    }
  }
}

async function runCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256, expectedOutput = null, tolerance = 0 }) {
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const isSql = language === 'sql';

  const memKb = Math.min(Math.max(Math.round(memoryLimit * 1024), 1024), 512000);

  const { data: submission } = await retryRequest(() =>
    codeboxClient.post(
      '/submissions?base64_encoded=false&wait=true',
      {
        source_code:    buildSubmissionSource(code, language, stdin),
        language_id:    languageId,
        stdin:          isSql ? '' : stdin,
        cpu_time_limit: timeLimit,
        memory_limit:   memKb,
      }
    )
  );

  const actual = submission.stdout || '';
  const expected = expectedOutput != null ? String(expectedOutput) : null;

  return {
    status:        submission.status?.description || 'Unknown',
    statusId:      submission.status?.id || 0,
    stdout:        submission.stdout || '',
    stderr:        submission.stderr || '',
    compileOutput: submission.compile_output || '',
    time:          submission.time,
    memory:        submission.memory,
    expected:      expected,
    actual:        actual,
    passed:        submission.status?.id === 3 && (expected === null || outputsMatch(actual, expected, tolerance)),
  };
}

async function judgeSubmission({ code, language, testCases, timeLimit = 5, memoryLimit = 256 }) {
  if (!Array.isArray(testCases) || testCases.length === 0) return [];

  const languageId = LANGUAGE_IDS[language];
  if (!languageId) {
    return testCases.map((tc) => ({
      status: 'Error', passed: false, error: `Unsupported language: ${language}`,
      input: tc.input, hidden: tc.isHidden || false,
    }));
  }

  const isSql = language === 'sql';
  const memKb = Math.min(Math.max(Math.round(memoryLimit * 1024), 1024), 512000);
  const submissions = testCases.map((tc) => ({
    source_code:      buildSubmissionSource(code, language, tc.input),
    language_id:      languageId,
    stdin:            isSql ? '' : (tc.input || ''),
    expected_output:  tc.output != null ? String(tc.output) : undefined,
    cpu_time_limit:   timeLimit,
    memory_limit:     memKb,
  }));

  let tokens;
  try {
    const { data } = await retryRequest(() =>
      codeboxClient.post('/submissions/batch?base64_encoded=false', { submissions })
    );
    tokens = data.map((s) => s.token);
  } catch (err) {
    logger.error({ err: err.message }, 'Codebox batch submit failed, falling back to sequential mode');
    return sequentialFallback({ code, language, testCases, timeLimit, memoryLimit });
  }

  const tokenParam = tokens.join(',');
  let submissionResults = [];

  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const { data } = await retryRequest(() =>
      codeboxClient.get('/submissions/batch', {
        params: {
          tokens: tokenParam,
          base64_encoded: false,
          fields: 'token,stdout,stderr,status,compile_output,time,memory',
        },
      })
    );
    submissionResults = data.submissions;
    const stillRunning = submissionResults.some((s) => s.status?.id <= 2);
    if (!stillRunning) break;
  }

  return submissionResults.map((result, idx) => {
    const tc = testCases[idx];
    const actualOutput = (result.stdout || '').trim();
    const expectedOutput = (tc.output || '').trim();
    return {
      status:        result.status?.description || 'Unknown',
      statusId:      result.status?.id || 0,
      stdout:        result.stdout || '',
      stderr:        result.stderr || '',
      compileOutput: result.compile_output || '',
      time:          result.time,
      memory:        result.memory,
      input:         tc.input,
      expected:      expectedOutput,
      actual:        actualOutput,
      passed:        result.status?.id === 3 && outputsMatch(actualOutput, expectedOutput, tc.tolerance),
      hidden:        tc.isHidden || false,
    };
  });
}

async function sequentialFallback({ code, language, testCases, timeLimit, memoryLimit }) {
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) {
    return testCases.map((tc) => ({
      status: 'Error', passed: false, error: `Unsupported language: ${language}`,
      input: tc.input, hidden: tc.isHidden || false,
    }));
  }

  const isSql = language === 'sql';
  const memKb = Math.min(Math.max(Math.round(memoryLimit * 1024), 1024), 512000);
  const results = [];

  for (const tc of testCases) {
    try {
      const { data: submission } = await retryRequest(() =>
        codeboxClient.post(
          '/submissions?base64_encoded=false&wait=true',
          {
            source_code:     buildSubmissionSource(code, language, tc.input),
            language_id:     languageId,
            stdin:           isSql ? '' : (tc.input || ''),
            expected_output: tc.output != null ? String(tc.output) : undefined,
            cpu_time_limit:  timeLimit,
            memory_limit:    memKb,
          }
        )
      );

      const actualOutput = (submission.stdout || '').trim();
      const expectedOutput = (tc.output || '').trim();

      results.push({
        status:        submission.status?.description || 'Unknown',
        statusId:      submission.status?.id || 0,
        stdout:        submission.stdout || '',
        stderr:        submission.stderr || '',
        compileOutput: submission.compile_output || '',
        time:          submission.time,
        memory:        submission.memory,
        input:         tc.input,
        expected:      expectedOutput,
        actual:        actualOutput,
        passed:        submission.status?.id === 3 && outputsMatch(actualOutput, expectedOutput, tc.tolerance),
        hidden:        tc.isHidden || false,
      });
    } catch (err) {
      results.push({
        status: 'Error', passed: false, error: err.message,
        input: tc.input, hidden: tc.isHidden || false,
      });
    }
  }

  return results;
}

async function isCodeboxAvailable() {
  try {
    await codeboxClient.get('/health', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function submitRunCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256 }) {
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const isSql = language === 'sql';

  const memKb = Math.min(Math.max(Math.round(memoryLimit * 1024), 1024), 512000);

  const { data } = await retryRequest(() =>
    codeboxClient.post(
      '/submissions?base64_encoded=false&wait=false',
      {
        source_code:    buildSubmissionSource(code, language, stdin),
        language_id:    languageId,
        stdin:          isSql ? '' : stdin,
        cpu_time_limit: timeLimit,
        memory_limit:   memKb,
      }
    )
  );
  return data.token;
}

async function pollSubmissionStatus(token) {
  const { data } = await codeboxClient.get(`/submissions/${token}`, {
    params: {
      base64_encoded: false,
      fields: 'token,stdout,stderr,status,compile_output,time,memory',
    },
  });
  if (!data || data.status?.id <= 2) return null;
  return {
    status:        data.status?.description || 'Unknown',
    statusId:      data.status?.id || 0,
    stdout:        data.stdout || '',
    stderr:        data.stderr || '',
    compileOutput: data.compile_output || '',
    time:          data.time,
    memory:        data.memory,
    passed:        data.status?.id === 3,
  };
}

async function waitForResult(token, pollIntervalMs = 1000, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await pollSubmissionStatus(token).catch(() => null);
    if (result) return result;
    await sleep(pollIntervalMs);
  }
  return {
    status: 'Error', statusId: 0, stdout: '', stderr: '',
    compileOutput: '', time: null, memory: null, passed: false,
    error: 'Execution timed out after ' + (pollIntervalMs * maxAttempts / 1000) + 's',
  };
}

module.exports = { runCode, submitRunCode, pollSubmissionStatus, waitForResult, judgeSubmission, isCodeboxAvailable, outputsMatch, LANGUAGE_IDS };
