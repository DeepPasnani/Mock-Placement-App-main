#!/usr/bin/env node

/**
 * Judge0 Load Test
 *
 * Simulates 150 concurrent students submitting code executions while
 * validating that login, dashboard, MCQ endpoints remain responsive.
 *
 * Usage:
 *   node scripts/load-test.js [--duration 60] [--concurrency 150] [--url http://localhost:5000]
 */

const http = require('http');
const url = require('url');
const querystring = require('querystring');

const BASE_URL = process.env.API_URL || process.argv.find(a => a.startsWith('--url='))?.split('=')[1] || 'http://localhost:5000';
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1]) || 150;
const DURATION_SECONDS = parseInt(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1]) || 60;

const parsedUrl = new url.URL(BASE_URL);

let completedRequests = 0;
let failedRequests = 0;
const latencies = [];
let isRunning = true;

const SAMPLE_CODE = {
  python: 'print("hello world")',
  javascript: 'console.log("hello world")',
  java: 'public class Main { public static void main(String[] args) { System.out.println("hello"); } }',
  cpp: '#include <iostream>\nint main() { std::cout << "hello"; return 0; }',
  c: '#include <stdio.h>\nint main() { printf("hello"); return 0; }',
};

const LANGUAGES = ['python', 'javascript', 'java', 'cpp', 'c'];

// ── Token cache ────────────────────────────────────────────
let studentToken = null;
let adminToken = null;

async function acquireTokens() {
  try {
    const loginRes = await httpPost('/api/auth/login', { email: 'student@test.edu', password: 'testpass123' });
    const loginData = JSON.parse(loginRes);
    studentToken = loginData.token;
    console.log('✓ Acquired student token');
  } catch (err) {
    console.error('Failed to acquire student token:', err.message);
  }

  try {
    const adminLoginRes = await httpPost('/api/auth/login', { email: 'admin@test.edu', password: 'testpass123' });
    const adminData = JSON.parse(adminLoginRes);
    adminToken = adminData.token;
    console.log('✓ Acquired admin token');
  } catch (err) {
    console.error('Failed to acquire admin token:', err.message);
  }
}

// ── HTTP helpers ───────────────────────────────────────────
function httpRequest(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 30000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - start;
        latencies.push(latency);
        completedRequests++;
        resolve(data);
      });
    });

    req.on('error', (err) => {
      failedRequests++;
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      failedRequests++;
      reject(new Error('Request timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function httpPost(path, data, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return httpRequest('POST', path, data, headers);
}

function httpGet(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return httpRequest('GET', path, null, headers);
}

// ── Scenario: Code execution ───────────────────────────────
async function simulateCodeExecution(token) {
  const language = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
  const code = SAMPLE_CODE[language];

  try {
    await httpPost('/api/submissions/run-code', {
      code,
      language,
      stdin: '',
      timeLimit: 2,
    }, token);
  } catch (err) {
    // Expected for some requests under load
  }
}

// ── Scenario: Login ────────────────────────────────────────
async function simulateLogin() {
  try {
    await httpPost('/api/auth/login', {
      email: `student${Math.floor(Math.random() * 1000)}@test.edu`,
      password: 'testpass123',
    });
  } catch {
    // Expected for non-existent users
  }
}

// ── Scenario: Dashboard ────────────────────────────────────
async function simulateDashboard(token) {
  try {
    await httpGet('/api/tests', token);
  } catch {
    // Expected under load
  }
}

// ── Scenario: MCQ endpoints ────────────────────────────────
async function simulateMcqQuery(token) {
  try {
    await httpGet('/api/users/stats', token);
  } catch {
    // Expected under load
  }
}

// ── Worker loop ────────────────────────────────────────────
async function worker(id) {
  const scenarios = [
    () => simulateCodeExecution(studentToken),
    () => simulateCodeExecution(studentToken),
    () => simulateLogin(),
    () => simulateDashboard(adminToken),
    () => simulateMcqQuery(adminToken),
  ];

  while (isRunning) {
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    try {
      await scenario();
    } catch {
      // silently continue
    }
    // Small random pause between requests (10-50ms)
    await new Promise(r => setTimeout(r, Math.random() * 40 + 10));
  }
}

// ── Stats reporter ─────────────────────────────────────────
function printStats() {
  if (latencies.length === 0) return;

  const sorted = [...latencies].sort((a, b) => a - b);
  const total = sorted.length;
  const avg = sorted.reduce((a, b) => a + b, 0) / total;
  const p50 = sorted[Math.floor(total * 0.5)];
  const p90 = sorted[Math.floor(total * 0.9)];
  const p95 = sorted[Math.floor(total * 0.95)];
  const p99 = sorted[Math.floor(total * 0.99)];
  const max = sorted[total - 1];
  const min = sorted[0];

  console.log('\n── Load Test Results ──────────────────────');
  console.log(`  Duration:        ${DURATION_SECONDS}s`);
  console.log(`  Concurrency:     ${CONCURRENCY} workers`);
  console.log(`  Target:          ${BASE_URL}`);
  console.log(`  Completed:       ${completedRequests}`);
  console.log(`  Failed:          ${failedRequests}`);
  console.log(`  Throughput:      ${(completedRequests / DURATION_SECONDS).toFixed(1)} req/s`);
  console.log('');
  console.log('  Latency (ms):');
  console.log(`    Min:           ${min.toFixed(0)}`);
  console.log(`    Avg:           ${avg.toFixed(0)}`);
  console.log(`    p50 (median):  ${p50.toFixed(0)}`);
  console.log(`    p90:           ${p90.toFixed(0)}`);
  console.log(`    p95:           ${p95.toFixed(0)}`);
  console.log(`    p99:           ${p99.toFixed(0)}`);
  console.log(`    Max:           ${max.toFixed(0)}`);
  console.log('──────────────────────────────────────────────\n');

  // Health check: warn if p99 > 5s or failure rate > 10%
  if (p99 > 5000) console.warn('⚠ WARNING: p99 latency exceeds 5 seconds');
  if (failedRequests / Math.max(completedRequests + failedRequests, 1) > 0.1) {
    console.warn('⚠ WARNING: Failure rate exceeds 10%');
  }
  if (p99 <= 5000 && failedRequests / Math.max(completedRequests + failedRequests, 1) <= 0.1) {
    console.log('✓ PASS: System responsive under load');
  }
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  console.log(`
═══ Judge0 Load Test ═══════════════════════════════════
  Concurrency: ${CONCURRENCY} workers
  Duration:    ${DURATION_SECONDS}s
  Target:      ${BASE_URL}
═══════════════════════════════════════════════════════════
`);

  await acquireTokens();

  console.log(`Starting ${CONCURRENCY} concurrent workers for ${DURATION_SECONDS}s...\n`);

  const workers_ = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers_.push(worker(i));
  }

  await new Promise(r => setTimeout(r, DURATION_SECONDS * 1000));
  isRunning = false;

  await Promise.all(workers_);
  printStats();
}

main().catch(err => {
  console.error('Load test failed:', err);
  process.exit(1);
});
