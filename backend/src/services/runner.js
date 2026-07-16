const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Language → Docker image + compile/run commands
const LANG_CONFIG = {
  python: {
    image: 'python:3.11-alpine',
    ext: '.py',
    run: (file) => `python ${file}`,
  },
  javascript: {
    image: 'node:20-alpine',
    ext: '.js',
    run: (file) => `node ${file}`,
  },
  java: {
    image: 'openjdk:19-slim',
    ext: '.java',
    run: (file) => {
      const dir = path.dirname(file);
      const name = path.basename(file, '.java');
      return `javac ${file} 2>&1 && java -cp ${dir} ${name}`;
    },
  },
  cpp: {
    image: 'gcc:13-bookworm',
    ext: '.cpp',
    run: (file) => `g++ ${file} -o ${file}.out 2>&1 && ${file}.out`,
  },
  c: {
    image: 'gcc:13-bookworm',
    ext: '.c',
    run: (file) => `gcc ${file} -o ${file}.out 2>&1 && ${file}.out`,
  },
};

const RUN_DIR = path.join(os.tmpdir(), 'campustrack-runs');
const TIMEOUT_MS = 30000;

// ── Docker availability check on startup ─────────────────────
let dockerAvailable = false;
try {
  execSync('docker info', { stdio: 'ignore', timeout: 5000 });
  dockerAvailable = true;
  console.log('✅ Docker available — using local code runner');
} catch {
  console.warn('⚠️  Docker not available — falling back to Judge0');
}

function isDockerAvailable() { return dockerAvailable; }

/**
 * Run code against a single test case in a Docker container.
 * Returns { status, statusId, stdout, stderr, time, memory, passed }
 */
async function runCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256 }) {
  const config = LANG_CONFIG[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  const id = crypto.randomUUID();
  const dir = path.join(RUN_DIR, id);

  try {
    fs.mkdirSync(dir, { recursive: true });

    // Write code file
    const codeFile = path.join(dir, `solution${config.ext}`);
    fs.writeFileSync(codeFile, code);

    // Write stdin
    const stdinFile = path.join(dir, 'stdin.txt');
    fs.writeFileSync(stdinFile, stdin || '');

    // Build docker command
    const runCmd = config.run(`/code/solution${config.ext}`);
    const dockerCmd = [
      'docker', 'run', '--rm',
      '--network', 'none',
      '--memory', `${memoryLimit}m`,
      '--cpus', '1',
      '--pids-limit', '50',
      '--ulimit', 'nproc=50',
      '-v', `${dir}:/code:ro`,
      config.image,
      'sh', '-c',
      `timeout ${timeLimit} ${runCmd} < /code/stdin.txt`,
    ].join(' ');

    // Execute
    const startTime = Date.now();
    const stdout = execSync(dockerCmd, {
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    const elapsed = Date.now() - startTime;

    return {
      status: 'Accepted',
      statusId: 3,
      stdout: stdout.toString().trim(),
      stderr: '',
      compileOutput: '',
      time: (elapsed / 1000).toFixed(3),
      memory: 0,
      passed: true,
    };
  } catch (err) {
    if (err.stderr) {
      return {
        status: 'Runtime Error',
        statusId: 4,
        stdout: err.stdout?.toString()?.trim() || '',
        stderr: err.stderr?.toString()?.trim() || '',
        time: '0',
        memory: 0,
        passed: false,
      };
    }
    if (err.killed || err.message?.includes('timeout') || err.message?.includes('Timed out')) {
      return {
        status: 'Time Limit Exceeded',
        statusId: 5,
        stdout: '',
        stderr: 'Execution timed out',
        time: timeLimit.toString(),
        memory: 0,
        passed: false,
      };
    }
    return {
      status: 'Error',
      statusId: 6,
      stdout: '',
      stderr: err.message,
      time: '0',
      memory: 0,
      passed: false,
    };
  } finally {
    // Cleanup temp files
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * Run code against multiple test cases.
 * Same interface as judge0.judgeSubmission().
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
        input: tc.input,
        expected: expectedOutput,
        actual: actualOutput,
        passed: result.passed && actualOutput === expectedOutput,
        hidden: tc.isHidden || false,
      });
    } catch (err) {
      results.push({
        status: 'Error',
        passed: false,
        error: err.message,
        input: tc.input,
        hidden: tc.isHidden || false,
      });
    }
  }
  return results;
}

module.exports = { runCode, judgeSubmission, isDockerAvailable, LANG_CONFIG };
