const logger = require('./logger');
const codebox = require('./codebox');

async function runCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256 }) {
  return codebox.runCode({ code, language, stdin, timeLimit, memoryLimit });
}

async function submitRunCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256 }) {
  return codebox.submitRunCode({ code, language, stdin, timeLimit, memoryLimit });
}

async function pollSubmissionStatus(token) {
  return codebox.pollSubmissionStatus(token);
}

async function waitForResult(token, pollIntervalMs, maxAttempts) {
  return codebox.waitForResult(token, pollIntervalMs, maxAttempts);
}

async function judgeSubmission({ code, language, testCases, timeLimit, memoryLimit }) {
  return codebox.judgeSubmission({ code, language, testCases, timeLimit, memoryLimit });
}

module.exports = { runCode, submitRunCode, pollSubmissionStatus, waitForResult, judgeSubmission };
