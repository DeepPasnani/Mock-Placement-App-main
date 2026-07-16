const axios = require('axios');

// Judge0 language IDs
const LANGUAGE_IDS = {
  python:     71,  // Python 3.8
  javascript: 63,  // Node.js 12
  java:       62,  // Java 13
  cpp:        54,  // C++ 17 (GCC 9.2)
  c:          50,  // C (GCC 9.2)
};

const judge0Client = axios.create({
  baseURL: process.env.JUDGE0_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-RapidAPI-Key':  process.env.JUDGE0_API_KEY,
    'X-RapidAPI-Host': process.env.JUDGE0_API_HOST,
  },
  timeout: 30000,
});

/**
 * Submit code to Judge0 and wait for result.
 * Returns { status, stdout, stderr, time, memory, compile_output }
 */
async function runCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256000 }) {
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  // Create submission
  const { data: submission } = await judge0Client.post('/submissions?base64_encoded=false&wait=false', {
    source_code:     code,
    language_id:     languageId,
    stdin:           stdin,
    cpu_time_limit:  timeLimit,
    memory_limit:    memoryLimit * 1024, // convert MB to KB
  });

  const token = submission.token;
  if (!token) throw new Error('No submission token received from Judge0');

  // Poll for result (max 15 seconds)
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const { data: result } = await judge0Client.get(
      `/submissions/${token}?base64_encoded=false`
    );

    // Status 1 = In Queue, 2 = Processing
    if (result.status.id <= 2) continue;

    return {
      status:          result.status.description,
      statusId:        result.status.id,
      stdout:          result.stdout || '',
      stderr:          result.stderr || '',
      compileOutput:   result.compile_output || '',
      time:            result.time,
      memory:          result.memory,
      passed:          result.status.id === 3, // 3 = Accepted
    };
  }

  return { status: 'Time Limit Exceeded', statusId: 5, stdout: '', stderr: '', passed: false };
}

/**
 * Run code against multiple test cases.
 * Returns array of per-test-case results.
 */
async function judgeSubmission({ code, language, testCases, timeLimit, memoryLimit }) {
  const results = [];

  for (const tc of testCases) {
    try {
      const result = await runCode({ code, language, stdin: tc.input, timeLimit, memoryLimit });
      const actualOutput = (result.stdout || '').trim();
      const expectedOutput = (tc.output || '').trim();
      results.push({
        ...result,
        input:    tc.input,
        expected: expectedOutput,
        actual:   actualOutput,
        passed:   result.passed && actualOutput === expectedOutput,
        hidden:   tc.isHidden || false,
      });
    } catch (err) {
      results.push({ status: 'Error', passed: false, error: err.message, hidden: tc.isHidden || false });
    }
  }

  return results;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runCode, judgeSubmission, LANGUAGE_IDS };
