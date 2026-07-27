const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const logger = require('./logger');

const RUN_DIR = path.join(os.tmpdir(), 'campustrack-sandbox');

const LANG_CONFIG = {
  python: {
    image: 'python:3.11-alpine',
    ext: '.py',
    compile: null,
    run: (file) => `python ${file}`,
    timeout: 10,
    memoryLimit: 256,
  },
  javascript: {
    image: 'node:20-alpine',
    ext: '.js',
    compile: null,
    run: (file) => `node ${file}`,
    timeout: 10,
    memoryLimit: 256,
    cacheVolumes: ['node_modules'],
  },
  java: {
    image: 'openjdk:19-slim',
    ext: '.java',
    compile: (file) => {
      const name = path.basename(file, '.java');
      return `javac ${file} 2>&1`;
    },
    run: (file) => {
      const dir = path.dirname(file);
      const name = path.basename(file, '.java');
      return `java -cp ${dir} ${name}`;
    },
    timeout: 15,
    memoryLimit: 512,
  },
  cpp: {
    image: 'gcc:13-bookworm',
    ext: '.cpp',
    compile: (file) => {
      const out = `${file}.out`;
      return `g++ ${file} -o ${out} -O2 -std=c++17 -lm 2>&1`;
    },
    run: (file) => `${file}.out`,
    timeout: 10,
    memoryLimit: 256,
  },
  c: {
    image: 'gcc:13-bookworm',
    ext: '.c',
    compile: (file) => {
      const out = `${file}.out`;
      return `gcc ${file} -o ${out} -O2 -lm 2>&1`;
    },
    run: (file) => `${file}.out`,
    timeout: 10,
    memoryLimit: 256,
  },
  go: {
    image: 'golang:1.22-alpine',
    ext: '.go',
    compile: (file) => `go build -o /code/solution ${file} 2>&1`,
    run: () => `/code/solution`,
    timeout: 15,
    memoryLimit: 512,
  },
  rust: {
    image: 'rust:1.77-slim-bookworm',
    ext: '.rs',
    compile: (file) => `rustc ${file} -o /code/solution 2>&1`,
    run: () => `/code/solution`,
    timeout: 20,
    memoryLimit: 512,
    cacheVolumes: ['/usr/local/cargo/registry'],
  },
  ruby: {
    image: 'ruby:3.3-alpine',
    ext: '.rb',
    compile: null,
    run: (file) => `ruby ${file}`,
    timeout: 10,
    memoryLimit: 256,
  },
  kotlin: {
    image: 'gradle:8.7-jdk21-alpine',
    ext: '.kt',
    compile: (file) => {
      const name = path.basename(file, '.kt');
      return `kotlinc ${file} -include-runtime -d /code/${name}.jar 2>&1`;
    },
    run: (file) => {
      const name = path.basename(file, '.kt');
      return `java -jar /code/${name}.jar`;
    },
    timeout: 30,
    memoryLimit: 768,
  },
  sql: {
    // SQL problems ship their schema + sample data as the test case's
    // "input" (stdin) and the student's query as their "code". We
    // concatenate the two and pipe the combined script into sqlite3's
    // in-memory database, so schema/data is always set up before the
    // student's query runs against it; sqlite3 prints query results to
    // stdout same as any other test-case comparison.
    image: 'keinos/sqlite3:latest',
    ext: '.sql',
    compile: null,
    run: (file) => `sh -c "cat /code/stdin.txt ${file} | sqlite3 :memory:"`,
    timeout: 10,
    memoryLimit: 256,
  },
};

const MAX_CONCURRENT = 5;
let activeJobs = 0;
const jobQueue = [];
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map();

let dockerAvailable = false;
try {
  execSync('docker info', { stdio: 'ignore', timeout: 5000 });
  dockerAvailable = true;
  logger.info('Sandbox: Docker available');
} catch {
  logger.warn('Sandbox: Docker not available');
}

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);

async function enqueue(fn) {
  if (activeJobs < MAX_CONCURRENT) {
    activeJobs++;
    try { return await fn(); } finally { activeJobs--; }
  }
  return new Promise((resolve, reject) => {
    jobQueue.push(async () => {
      activeJobs++;
      try { resolve(await fn()); } finally { activeJobs--; dequeue(); }
    });
  });
}

function dequeue() {
  if (jobQueue.length > 0 && activeJobs < MAX_CONCURRENT) {
    const next = jobQueue.shift();
    next();
  }
}

function buildDockerArgs(config, dir, codeFile, stdinFile, timeLimit, memoryLimit) {
  const args = [
    'docker', 'run', '--rm',
    '--cap-drop=ALL',
    '--cap-add=DAC_OVERRIDE',
    '--read-only',
    '--network', 'none',
    '--memory', `${memoryLimit || config.memoryLimit || 256}m`,
    '--cpus', '1',
    '--pids-limit', '50',
    '--ulimit', 'nproc=50',
    '--ulimit', 'fsize=10000',
    '--security-opt', 'no-new-privileges:true',
    '-v', `${dir}:/code:rw`,
    '-v', `${dir}/stdin.txt:/code/stdin.txt:ro`,
    '--tmpfs', '/tmp:noexec,nosuid,size=64m',
  ];

  if (config.cacheVolumes) {
    const cacheDir = path.join(RUN_DIR, 'cache', config.image.replace(/[^a-z0-9]/gi, '_'));
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    for (const vol of config.cacheVolumes) {
      args.push('-v', `${cacheDir}${vol}:/code/${vol}:rw`);
    }
  }

  return args;
}

function measureResources(config, dir, codeFile, stdinFile, timeLimit, memoryLimit, compileCmd, runCmd) {
  const dockerArgs = buildDockerArgs(config, dir, codeFile, stdinFile, timeLimit, memoryLimit);

  let command;
  if (compileCmd) {
    command = `${compileCmd} && timeout ${timeLimit || config.timeout || 10} ${runCmd} < /code/stdin.txt`;
  } else {
    command = `timeout ${timeLimit || config.timeout || 10} ${runCmd} < /code/stdin.txt`;
  }

  const fullArgs = [
    ...dockerArgs,
    config.image,
    'sh', '-c',
    `/usr/bin/time -v sh -c '${command}' 2>&1`,
  ];

  return fullArgs;
}

async function runSandbox({ code, language, stdin = '', timeLimit, memoryLimit, userId }) {
  if (!dockerAvailable) {
    return {
      status: 'Error',
      statusId: 6,
      stdout: '',
      stderr: 'Docker is not available on this server',
      time: '0',
      memory: 0,
      passed: false,
      resourceUsage: null,
    };
  }

  if (userId && !checkRateLimit(userId)) {
    return {
      status: 'Rate Limited',
      statusId: 7,
      stdout: '',
      stderr: 'Rate limit exceeded. Please wait before submitting again.',
      time: '0',
      memory: 0,
      passed: false,
      resourceUsage: null,
    };
  }

  const config = LANG_CONFIG[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  return enqueue(async () => {
    const id = crypto.randomUUID();
    const dir = path.join(RUN_DIR, id);

    try {
      fs.mkdirSync(dir, { recursive: true });

      const codeFile = path.join(dir, `solution${config.ext}`);
      fs.writeFileSync(codeFile, code);

      const stdinFile = path.join(dir, 'stdin.txt');
      fs.writeFileSync(stdinFile, stdin || '');

      fs.chmodSync(dir, 0o755);

      let runCmd = config.run(`/code/solution${config.ext}`);
      let compileCmd = null;
      if (config.compile) {
        compileCmd = config.compile(`/code/solution${config.ext}`);
      }

      const fullArgs = measureResources(config, dir, codeFile, stdinFile, timeLimit, memoryLimit, compileCmd, runCmd);
      const dockerCmdStr = fullArgs.join(' ');

      const startTime = Date.now();
      let stdout, stderr = '';
      let resourceUsage = null;

      try {
        stdout = execSync(dockerCmdStr, {
          timeout: ((timeLimit || config.timeout || 10) + 10) * 1000,
          maxBuffer: 10 * 1024 * 1024,
        });

        const output = stdout.toString();
        const lines = output.split('\n');

        const resourceIdx = lines.findIndex(l => l.includes('Command being timed'));
        let actualOutput = output;
        if (resourceIdx >= 0) {
          actualOutput = lines.slice(0, resourceIdx).join('\n');

          const usageLines = lines.slice(resourceIdx);
          const usageText = usageLines.join('\n');

          const memMatch = usageText.match(/Maximum resident set size \(kbytes\): (\d+)/);
          const cpuMatch = usageText.match(/Percent of CPU this job got: (\d+)/);
          const userMatch = usageText.match(/User time \(seconds\): ([\d.]+)/);
          const sysMatch = usageText.match(/System time \(seconds\): ([\d.]+)/);
          const wallMatch = usageText.match(/Elapsed \(wall clock\) time \(h:mm:ss or m:ss\): ([\d.:]+)/);

          resourceUsage = {
            memoryKb: memMatch ? parseInt(memMatch[1]) : 0,
            cpuPercent: cpuMatch ? parseInt(cpuMatch[1]) : 0,
            userTime: userMatch ? parseFloat(userMatch[1]) : 0,
            sysTime: sysMatch ? parseFloat(sysMatch[1]) : 0,
            wallTime: wallMatch ? wallMatch[1] : '0',
          };
        }

        const elapsed = Date.now() - startTime;
        return {
          status: 'Accepted',
          statusId: 3,
          stdout: actualOutput.trim(),
          stderr: '',
          compileOutput: '',
          time: (elapsed / 1000).toFixed(3),
          memory: resourceUsage?.memoryKb || 0,
          passed: true,
          resourceUsage,
        };
      } catch (err) {
        const elapsed = Date.now() - startTime;
        const errOut = err.stdout?.toString() || '';
        const errErr = err.stderr?.toString() || '';

        const output = errOut + '\n' + errErr;
        const lines = output.split('\n');
        const resourceIdx = lines.findIndex(l => l.includes('Command being timed'));
        let actualStdout = errOut;
        let actualStderr = errErr;
        if (resourceIdx >= 0) {
          actualStdout = lines.slice(0, resourceIdx).filter(l => !l.includes('Command being timed')).join('\n');
          const usageLines = lines.slice(resourceIdx);
          const usageText = usageLines.join('\n');
          const memMatch = usageText.match(/Maximum resident set size \(kbytes\): (\d+)/);
          resourceUsage = {
            memoryKb: memMatch ? parseInt(memMatch[1]) : 0,
          };
        }

        if (err.stderr && err.stderr.toString().includes('compile')) {
          return {
            status: 'Compilation Error',
            statusId: 6,
            stdout: actualStdout.trim(),
            stderr: actualStderr.trim(),
            compileOutput: actualStderr.trim(),
            time: (elapsed / 1000).toFixed(3),
            memory: resourceUsage?.memoryKb || 0,
            passed: false,
            resourceUsage,
          };
        }
        if (err.killed || err.message?.includes('timeout') || err.message?.includes('Timed out')) {
          return {
            status: 'Time Limit Exceeded',
            statusId: 5,
            stdout: actualStdout.trim(),
            stderr: 'Execution timed out',
            time: timeLimit?.toString() || (config.timeout || 10).toString(),
            memory: 0,
            passed: false,
            resourceUsage: null,
          };
        }
        return {
          status: 'Runtime Error',
          statusId: 4,
          stdout: actualStdout.trim(),
          stderr: actualStderr.trim() || err.message || '',
          time: (elapsed / 1000).toFixed(3),
          memory: resourceUsage?.memoryKb || 0,
          passed: false,
          resourceUsage,
        };
      }
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
    }
  });
}

async function judgeSandbox({ code, language, testCases, timeLimit, memoryLimit, userId }) {
  if (!Array.isArray(testCases)) return [];

  const results = [];
  for (const tc of testCases) {
    try {
      const result = await runSandbox({ code, language, stdin: tc.input || '', timeLimit, memoryLimit, userId });
      const actualOutput = (result.stdout || '').trimEnd();
      const expectedOutput = (tc.output || '').trimEnd();
      results.push({
        ...result,
        input: tc.input || '',
        expected: expectedOutput,
        actual: actualOutput,
        passed: result.passed && actualOutput === expectedOutput,
        hidden: tc.isHidden || false,
      });
    } catch (err) {
      results.push({
        status: 'Error', statusId: 6, passed: false,
        error: err.message, input: tc.input || '',
        hidden: tc.isHidden || false,
      });
    }
  }
  return results;
}

module.exports = { runSandbox, judgeSandbox, LANG_CONFIG, isDockerAvailable: () => dockerAvailable };
