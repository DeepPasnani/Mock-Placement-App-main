const { execSync } = require('child_process');
const logger = require('./logger');
const { runSandbox, judgeSandbox, LANG_CONFIG, isDockerAvailable } = require('./sandbox');

async function runCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256, userId }) {
  return runSandbox({ code, language, stdin, timeLimit, memoryLimit, userId });
}

async function judgeSubmission({ code, language, testCases, timeLimit, memoryLimit, userId }) {
  return judgeSandbox({ code, language, testCases, timeLimit, memoryLimit, userId });
}

module.exports = { runCode, judgeSubmission, isDockerAvailable, LANG_CONFIG };
