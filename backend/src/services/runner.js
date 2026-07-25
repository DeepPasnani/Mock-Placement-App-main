const { execSync } = require('child_process');
const logger = require('./logger');
const { runSandbox, judgeSandbox, LANG_CONFIG, isDockerAvailable } = require('./sandbox');
const judge0 = require('./judge0');

// ── Execution provider switch ───────────────────────────────────
// CODE_EXECUTION_PROVIDER=judge0   -> use self-hosted/RapidAPI Judge0
//                                     (submits all test cases in ONE
//                                     batch request, run simultaneously
//                                     by Judge0's workers)
// CODE_EXECUTION_PROVIDER=sandbox  -> use the local per-container Docker
//                                     sandbox (runs test cases one at a
//                                     time; this was the only option
//                                     before Judge0 was wired in)
// unset / anything else            -> auto: use Judge0 if JUDGE0_API_URL
//                                     is configured, otherwise fall back
//                                     to the local sandbox
const PROVIDER = (process.env.CODE_EXECUTION_PROVIDER || 'auto').toLowerCase();

function useJudge0() {
  if (PROVIDER === 'judge0') return true;
  if (PROVIDER === 'sandbox') return false;
  return !!process.env.JUDGE0_API_URL; // auto mode
}

async function runCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256, userId }) {
  if (useJudge0()) {
    try {
      return await judge0.runCode({ code, language, stdin, timeLimit, memoryLimit });
    } catch (err) {
      logger.error({ err: err.message }, 'Judge0 runCode failed, falling back to local sandbox');
    }
  }
  return runSandbox({ code, language, stdin, timeLimit, memoryLimit, userId });
}

async function judgeSubmission({ code, language, testCases, timeLimit, memoryLimit, userId }) {
  if (useJudge0()) {
    try {
      return await judge0.judgeSubmission({ code, language, testCases, timeLimit, memoryLimit });
    } catch (err) {
      logger.error({ err: err.message }, 'Judge0 judgeSubmission failed, falling back to local sandbox');
    }
  }
  return judgeSandbox({ code, language, testCases, timeLimit, memoryLimit, userId });
}

module.exports = { runCode, judgeSubmission, isDockerAvailable, LANG_CONFIG };
