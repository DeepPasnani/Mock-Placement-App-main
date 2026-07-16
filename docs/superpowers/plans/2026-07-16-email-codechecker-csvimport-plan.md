# Email, Code Checker & CSV Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three independent features: admin email composer, per-test-case code checker with Docker evaluator, and CSV question import.

**Architecture:** Three independent feature tracks — each can be built in any order. Backend is Express/Node.js (CommonJS), frontend is React with react-query. Email uses existing nodemailer. Code checker adds Docker runner alongside existing Judge0. CSV import adds endpoint alongside existing JSON import.

**Tech Stack:** Node.js/Express, React/Vite, PostgreSQL, Redis, nodemailer, Docker (new), Judge0 (existing)

## Global Constraints

- All backend code CommonJS (`require`/`module.exports`)
- No new npm dependencies unless explicitly noted
- Follow existing project patterns (panel-based UI, dark theme, font-mono for data, etc.)
- All new endpoints require `authenticate` + `requireAdmin` middleware
- Reuse existing `sendEmail()` from `services/email.js`
- Docker evaluator falls back to Judge0 when Docker unavailable
- CSV parsing uses Node stdlib first (manual quoted-field handling)

---

## Task Group A: Admin Email System

### Task A1: Backend — Email send endpoint

**Files:**
- Create: `backend/src/controllers/email.js`
- Create: `backend/src/routes/email.js`
- Modify: `backend/src/routes/index.js`

**Interfaces:**
- Consumes: `sendEmail()` from `services/email.js`, DB `query()`
- Produces: `POST /api/email/send` endpoint

- [ ] **Step 1: Create email controller**

```javascript
// backend/src/controllers/email.js
const { query } = require('../db');
const { sendEmail } = require('../services/email');
const { wrap } = require('../services/email');

async function sendBulkEmail(req, res) {
  const { subject, html, recipients } = req.body;

  if (!subject || !html) {
    return res.status(400).json({ error: 'Subject and body are required' });
  }

  // Resolve recipient list
  let emails = [];

  if (recipients?.allStudents) {
    const { rows } = await query(
      "SELECT email, name FROM users WHERE role='student' AND is_active=true"
    );
    emails = rows;
  } else {
    const conditions = [];
    const params = [];
    let idx = 0;

    if (recipients?.departments?.length) {
      params.push(recipients.departments);
      conditions.push(`department = ANY($${++idx})`);
    }
    if (recipients?.batches?.length) {
      params.push(recipients.batches);
      conditions.push(`id IN (SELECT user_id FROM student_batches WHERE batch_id = ANY($${++idx}))`);
    }
    if (recipients?.studentIds?.length) {
      params.push(recipients.studentIds);
      conditions.push(`id = ANY($${++idx})`);
    }

    if (!conditions.length) {
      return res.status(400).json({ error: 'No recipients specified' });
    }

    params.push(true);
    const { rows } = await query(
      `SELECT email, name FROM users WHERE role='student' AND is_active=true AND (${conditions.join(' OR ')})`,
      params
    );
    emails = rows;
  }

  if (!emails.length) {
    return res.status(400).json({ error: 'No students match the selected criteria' });
  }

  // Deduplicate by email
  const seen = new Set();
  const unique = emails.filter(e => {
    const key = e.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Send
  let sent = 0;
  let errors = 0;
  for (const student of unique) {
    try {
      await sendEmail({
        to: student.email,
        subject,
        html: wrap(subject, html),
      });
      sent++;
    } catch {
      errors++;
    }
  }

  // Log to audit
  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, metadata, ip_address)
     VALUES ($1, 'email_sent', 'email', $2, $3)`,
    [req.user.id, JSON.stringify({ subject, recipientCount: unique.length, sent, errors }), req.ip]
  ).catch(() => {}); // non-critical

  res.json({ sent, errors, total: unique.length });
}

module.exports = { sendBulkEmail };
```

- [ ] **Step 2: Create email route**

```javascript
// backend/src/routes/email.js
const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const emailCtrl = require('../controllers/email');

router.post('/send', authenticate, requireAdmin, emailCtrl.sendBulkEmail);

module.exports = router;
```

- [ ] **Step 3: Mount route in index.js**

Add to `backend/src/routes/index.js`:
```javascript
// ── Email ────────────────────────────────────────────────
const emailCtrl = require('../controllers/email');
router.post('/email/send', authenticate, requireAdmin, emailCtrl.sendBulkEmail);
```

Skip the separate route file — ponytail: mount directly in `index.js` to avoid creating a file for one route.

- [ ] **Step 4: Export template bodies from email service**

Modify `backend/src/services/email.js` — export the template bodies so the frontend can pre-fill the composer:

After the existing `wrap()` function, add:
```javascript
// ── Template library for admin email composer ─────────────
const TEMPLATES = {
  blank: {
    label: 'Blank',
    subject: '',
    body: '',
  },
  welcome: {
    label: 'Welcome',
    subject: '🎓 Welcome to PlacementPro!',
    body: '<p>Hi {name},</p><p>Your account has been successfully created on <strong>PlacementPro</strong> — your campus placement assessment platform.</p><p>You can now log in and access aptitude tests, coding challenges, and placement preparation resources.</p><p>Best of luck with your placement journey! 🚀</p>',
  },
  testScheduled: {
    label: 'Test Scheduled',
    subject: '📋 New Test Scheduled: {test_title}',
    body: '<p>Hi {name},</p><p>A new placement test has been scheduled for your department. Please make sure you\'re prepared and available at the scheduled time.</p><p>Log in to PlacementPro to view the details.</p>',
  },
  testResults: {
    label: 'Test Results Available',
    subject: '📊 Your Results: {test_title}',
    body: '<p>Hi {name},</p><p>Your results for <strong>{test_title}</strong> are now available. Log in to PlacementPro to view your detailed score breakdown.</p>',
  },
  passwordReset: {
    label: 'Password Reset',
    subject: '🔐 Password Reset OTP — PlacementPro',
    body: '<p>Hi {name},</p><p>We received a request to reset your PlacementPro password. Use the OTP shown on screen to complete the process.</p><p>If you did not request a password reset, ignore this email.</p>',
  },
};

module.exports = {
  sendWelcomeEmail,
  sendTestScheduledEmail,
  sendTestResultEmail,
  sendPasswordResetEmail,
  sendAdminCreatedEmail,
  sendBulkImportEmail,
  sendEmail,
  wrap,
  TEMPLATES,
};
```

- [ ] **Step 5: Add email API to frontend**

Modify `frontend/src/services/api.js` — add after the `uploadAPI` block:

```javascript
// ── Email ────────────────────────────────────────────────────
export const emailAPI = {
  send: (data) => api.post('/email/send', data).then(r => r.data),
};
```

- [ ] **Step 6: Create email composer page**

```javascript
// frontend/src/pages/admin/SendEmail.jsx
import { useState } from 'react';
import { useQuery, useMutation } from 'react-query';
import { emailAPI, usersAPI, batchesAPI } from '../../services/api';
import { Btn, Modal, Alert, Spinner, Badge } from '../../components/shared/UI';
import toast from 'react-hot-toast';

const TEMPLATES = {
  blank: { label: 'Blank', subject: '', body: '' },
  welcome: { label: 'Welcome', subject: '🎓 Welcome to PlacementPro!', body: '<p>Hi {name},</p><p>Your account has been successfully created on <strong>PlacementPro</strong>.</p><p>Best of luck with your placement journey! 🚀</p>' },
  testScheduled: { label: 'Test Scheduled', subject: '📋 New Test Scheduled', body: '<p>Hi {name},</p><p>A new placement test has been scheduled. Log in for details.</p>' },
  testResults: { label: 'Test Results', subject: '📊 Your Results', body: '<p>Hi {name},</p><p>Your results are now available. Log in to view.</p>' },
  passwordReset: { label: 'Password Reset', subject: '🔐 Password Reset OTP', body: '<p>Hi {name},</p><p>Use the OTP provided to reset your password.</p>' },
};

export default function SendEmail() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [allStudents, setAllStudents] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [template, setTemplate] = useState('blank');
  const [studentSearch, setStudentSearch] = useState('');

  const { data: deptData } = useQuery('departments', () => usersAPI.list({ role: 'student', limit: 1 }).then(() =>
    fetch('/api/users?role=student&limit=1').then(r => r.json())
  ), { enabled: false }); // simplified — see below

  const { data: batchData } = useQuery('batches', batchesAPI.list);

  const { data: studentResults } = useQuery(
    ['students-search', studentSearch],
    () => usersAPI.list({ role: 'student', search: studentSearch, limit: 10 }),
    { enabled: studentSearch.length >= 2 }
  );

  const sendMut = useMutation(emailAPI.send, {
    onSuccess: (data) => {
      toast.success(`Email sent to ${data.sent} student(s)`);
      setShowConfirm(false);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to send'),
  });

  const handleTemplateChange = (tplKey) => {
    setTemplate(tplKey);
    const tpl = TEMPLATES[tplKey] || TEMPLATES.blank;
    setSubject(tpl.subject);
    setBody(tpl.body);
  };

  const toggleDept = (dept) => {
    setSelectedDepts(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const toggleBatch = (id) => {
    setSelectedBatches(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const toggleStudent = (id) => {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const getRecipientCount = () => {
    if (allStudents) return 'All students';
    const count = selectedDepts.length + selectedBatches.length + selectedStudents.length;
    return `${count} group(s)`;
  };

  const handleSend = () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body are required');
      return;
    }
    sendMut.mutate({
      subject: subject.trim(),
      html: body,
      recipients: {
        allStudents: allStudents || undefined,
        departments: selectedDepts.length ? selectedDepts : undefined,
        batches: selectedBatches.length ? selectedBatches : undefined,
        studentIds: selectedStudents.length ? selectedStudents : undefined,
      },
    });
  };

  // Departments — fetch from a quick query
  const { data: usersData } = useQuery(
    'students-for-email',
    () => usersAPI.list({ role: 'student', limit: 1 }),
    { enabled: false }
  );
  // For departments, we'll use a hardcoded common set + allow typing
  const departments = ['CSE', 'IT', 'ECE', 'EEE', 'ME', 'CE', 'AI', 'CSIT'];

  return (
    <div className="max-w-4xl animate-fade-up">
      <div className="section-header">
        <div>
          <h1 className="section-title">Send Email</h1>
          <p className="section-subtitle">Compose and send emails to students</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: composer */}
        <div className="lg:col-span-3 space-y-4">
          {/* Template selector */}
          <div>
            <label className="input-label">Template</label>
            <select
              value={template}
              onChange={e => handleTemplateChange(e.target.value)}
              className="select-field w-full"
            >
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <option key={key} value={key}>{tpl.label}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="input-label">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="input-field w-full"
              placeholder="Email subject…"
            />
          </div>

          {/* Body */}
          <div>
            <label className="input-label">Body (HTML)</label>
            {/* Simple formatting toolbar */}
            <div className="flex gap-1 mb-1.5">
              <button
                className="btn-ghost-icon text-xs px-2 py-1 rounded border border-rim"
                onClick={() => setBody(b => b + '<strong></strong>')}
                title="Bold"
              ><strong>B</strong></button>
              <button
                className="btn-ghost-icon text-xs px-2 py-1 rounded border border-rim"
                onClick={() => setBody(b => b + '<em></em>')}
                title="Italic"
              ><em>I</em></button>
              <button
                className="btn-ghost-icon text-xs px-2 py-1 rounded border border-rim"
                onClick={() => setBody(b => b + '<a href=""></a>')}
                title="Link"
              >🔗</button>
              <button
                className="btn-ghost-icon text-xs px-2 py-1 rounded border border-rim"
                onClick={() => setBody(b => b + '<ul>\n<li></li>\n</ul>')}
                title="List"
              >•</button>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              className="textarea-field w-full font-mono text-xs"
              rows={12}
              placeholder="<p>Hello {name},</p>..."
            />
          </div>

          {/* Preview */}
          {body && (
            <div className="panel p-4">
              <div className="text-xs text-annotation font-semibold mb-2">Preview</div>
              <div className="border border-rim rounded-lg p-4 bg-white text-black text-sm max-h-64 overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: body }} />
              </div>
            </div>
          )}

          {/* Send button */}
          <div className="flex justify-end">
            <Btn
              variant="primary"
              onClick={() => setShowConfirm(true)}
              disabled={!subject.trim() || !body.trim()}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send Email
            </Btn>
          </div>
        </div>

        {/* Right: recipients */}
        <div className="lg:col-span-2 space-y-4">
          <div className="panel p-4">
            <h3 className="text-sm font-display font-bold text-ink mb-3">Recipients</h3>

            {/* All students toggle */}
            <label className="flex items-center gap-2 mb-3 pb-3 border-b border-rim">
              <input
                type="checkbox"
                checked={allStudents}
                onChange={e => setAllStudents(e.target.checked)}
                className="accent-accent w-4 h-4"
              />
              <span className="text-sm text-ink">All Students</span>
            </label>

            {!allStudents && (
              <>
                {/* Departments */}
                <div className="mb-3">
                  <p className="text-xs text-annotation font-semibold mb-1.5">Departments</p>
                  <div className="flex flex-wrap gap-1">
                    {departments.map(dept => (
                      <button
                        key={dept}
                        onClick={() => toggleDept(dept)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          selectedDepts.includes(dept)
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-rim text-annotation hover:text-ink'
                        }`}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Batches */}
                <div className="mb-3">
                  <p className="text-xs text-annotation font-semibold mb-1.5">Batches</p>
                  <div className="flex flex-wrap gap-1">
                    {(batchData?.batches || []).map(b => (
                      <button
                        key={b.id}
                        onClick={() => toggleBatch(b.id)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          selectedBatches.includes(b.id)
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-rim text-annotation hover:text-ink'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Individual students */}
                <div>
                  <p className="text-xs text-annotation font-semibold mb-1.5">Individual Students</p>
                  <input
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="input-field w-full text-xs mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {(studentResults?.users || []).map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-panel rounded px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(s.id)}
                          onChange={() => toggleStudent(s.id)}
                          className="accent-accent w-3.5 h-3.5 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs text-ink truncate">{s.name || s.email}</div>
                          <div className="text-2xs text-annotation/60 truncate">{s.email}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Summary */}
            <div className="mt-4 pt-3 border-t border-rim">
              <div className="text-xs text-annotation">
                Recipients: <span className="text-ink font-semibold">{getRecipientCount()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Send Email?"
        width="max-w-sm"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setShowConfirm(false)} disabled={sendMut.isLoading}>Cancel</Btn>
            <Btn variant="primary" onClick={handleSend} disabled={sendMut.isLoading}>
              {sendMut.isLoading ? <><Spinner size={14} /> Sending…</> : `Send to ${getRecipientCount()}`}
            </Btn>
          </>
        }
      >
        <Alert type="warning" className="mb-3">
          This will email all selected recipients immediately.
        </Alert>
        <div className="space-y-1 text-sm text-ink/80">
          <p><strong>Subject:</strong> {subject}</p>
          <p><strong>Recipients:</strong> {getRecipientCount()}</p>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 7: Add sidebar link and route**

Modify `frontend/src/pages/admin/Layout.jsx`:

In the `NAV` array (inside `useMemo`), add after Results:
```javascript
{ to: '/admin/email', label: 'Send Email' },
```

In the `NAV_ICONS` object, add:
```javascript
'Send Email': 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
```

Modify `frontend/src/App.jsx` — add import:
```javascript
import SendEmail from './pages/admin/SendEmail';
```

And add route inside the admin `<Route>` block:
```javascript
<Route path="email" element={<SendEmail />} />
```

---

## Task Group B: Code Checker

### Task B1: Backend — Docker code runner

**Files:**
- Create: `backend/src/services/runner.js`
- Modify: `backend/src/controllers/submissions.js`

**Interfaces:**
- Consumes: Docker daemon via `child_process.exec`
- Produces: `runCode()`, `judgeSubmission()` — same interface as `judge0.js`

- [ ] **Step 1: Create Docker runner service**

```javascript
// backend/src/services/runner.js
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
      return `javac ${file} && java -cp ${dir} ${name}`;
    },
  },
  cpp: {
    image: 'gcc:13-bookworm',
    ext: '.cpp',
    run: (file) => `g++ ${file} -o ${file}.out && ${file}.out`,
  },
  c: {
    image: 'gcc:13-bookworm',
    ext: '.c',
    run: (file) => `gcc ${file} -o ${file}.out && ${file}.out`,
  },
};

const RUN_DIR = path.join(os.tmpdir(), 'campustrack-runs');
const TIMEOUT_MS = 30000;

// Check Docker availability on startup
let dockerAvailable = false;
try {
  execSync('docker info', { stdio: 'ignore', timeout: 5000 });
  dockerAvailable = true;
} catch {
  console.warn('⚠️  Docker not available — falling back to Judge0');
}

function isDockerAvailable() { return dockerAvailable; }

/**
 * Run code against a single test case in a Docker container.
 * Returns { stdout, stderr, time, memory, passed, status }
 */
async function runCode({ code, language, stdin = '', timeLimit = 5, memoryLimit = 256 }) {
  const config = LANG_CONFIG[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  const id = require('crypto').randomUUID();
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
    const output = execSync(dockerCmd, {
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      cwd: dir,
    });
    const elapsed = Date.now() - startTime;

    return {
      status: 'Accepted',
      statusId: 3,
      stdout: output.toString().trim(),
      stderr: '',
      compileOutput: '',
      time: (elapsed / 1000).toFixed(3),
      memory: 0,
      passed: true,
    };
  } catch (err) {
    // Parse error
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
    if (err.killed || err.message?.includes('timeout')) {
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
    // Cleanup
    fs.rmSync(dir, { recursive: true, force: true });
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
```

- [ ] **Step 2: Wire Docker runner into submissions controller**

Modify `backend/src/controllers/submissions.js`:

At the top, add:
```javascript
const { judgeSubmission: dockerJudge, isDockerAvailable } = require('../services/runner');
```

In `submitTest()`, replace the `judgeSubmission` call (inside the coding problems loop):
```javascript
// Line ~99: Replace the existing judgeSubmission call with try-runner-fallback
try {
  const judgeFn = isDockerAvailable() ? dockerJudge : judgeSubmission;
  const results = await judgeFn({
    code: sol[lang], language: lang,
    testCases: p.test_cases || [],
    timeLimit: p.time_limit_seconds,
    memoryLimit: p.memory_limit_mb,
  });
```

And add import for `judgeSubmission` from judge0 at the top:
```javascript
const { judgeSubmission: judge0Judge } = require('../services/judge0');
```
... then update the variable reference accordingly.

Actually simpler — keep the existing import and just add fallback logic:

```javascript
const { judgeSubmission } = require('../services/judge0');
```

And modify the try block:
```javascript
try {
  let results;
  if (isDockerAvailable()) {
    const docker = require('../services/runner');
    results = await docker.judgeSubmission({
      code: sol[lang], language: lang,
      testCases: p.test_cases || [],
      timeLimit: p.time_limit_seconds,
      memoryLimit: p.memory_limit_mb,
    });
  } else {
    results = await judgeSubmission({
      code: sol[lang], language: lang,
      testCases: p.test_cases || [],
      timeLimit: p.time_limit_seconds,
      memoryLimit: p.memory_limit_mb,
    });
  }
```

### Task B2: Backend — runCode endpoint with testCase support

**Files:**
- Modify: `backend/src/controllers/submissions.js`

**Interfaces:**
- Consumes: existing `runCode` from Judge0, OR new Docker `runCode`
- Produces: per-test-case results when `testCases` is provided

- [ ] **Step 1: Modify the runCode controller function**

Replace the existing `runCode` export in `submissions.js`:

```javascript
// POST /api/submissions/run-code (live code testing)
async function runCode(req, res) {
  const { code, language, stdin, testCases, timeLimit, memoryLimit } = req.body;
  if (!code || !language) return res.status(400).json({ error: 'Code and language required' });

  if (testCases && Array.isArray(testCases) && testCases.length > 0) {
    // Run against each test case
    let judgeFn;
    if (isDockerAvailable()) {
      const docker = require('../services/runner');
      judgeFn = docker.judgeSubmission;
    } else {
      judgeFn = require('../services/judge0').judgeSubmission;
    }
    const results = await judgeFn({
      code, language,
      testCases: testCases.filter(tc => !tc.isHidden), // only visible ones
      timeLimit: timeLimit || 5,
      memoryLimit: memoryLimit || 256,
    });
    return res.json({ results });
  }

  // Single execution (backward compatible)
  if (isDockerAvailable()) {
    const docker = require('../services/runner');
    const result = await docker.runCode({ code, language, stdin: stdin || '', timeLimit: timeLimit || 5, memoryLimit: memoryLimit || 256 });
    return res.json(result);
  }
  const { runCode: judgeRun } = require('../services/judge0');
  const result = await judgeRun({ code, language, stdin: stdin || '', timeLimit: 5, memoryLimit: 256 });
  res.json(result);
}
```

- [ ] **Step 2: Add import for isDockerAvailable at top of submissions.js**

```javascript
const { isDockerAvailable } = require('../services/runner');
```

### Task B3: Frontend — Run All Visible Tests UI

**Files:**
- Modify: `frontend/src/pages/student/TestInterface.jsx`

- [ ] **Step 1: Add "Run All Visible Tests" state and handler**

In `TestInterface`, after the existing `runResult` and `runLoading` states, add:
```javascript
const [testResults, setTestResults] = useState(null); // array of per-test-case results
const [testLoading, setTestLoading] = useState(false);
```

- [ ] **Step 2: Add handler for running all visible tests**

Add after `handleRunCode`:
```javascript
const handleRunAllTests = async () => {
  const q = section?.questions[currentQ];
  if (!q || q.type !== 'coding') return;
  const code = codeSolutions[q.id]?.[activeLang] || q.starter_code?.[activeLang] || '';
  if (!code.trim()) { toast.error('Write some code first.'); return; }
  setTestLoading(true);
  setTestResults(null);
  try {
    // Get visible test cases from the problem
    const visibleTests = (q.test_cases || []).filter(tc => !tc.isHidden);
    if (!visibleTests.length) {
      toast.error('No visible test cases for this problem.');
      setTestLoading(false);
      return;
    }
    const result = await submissionsAPI.runCode({
      code,
      language: activeLang,
      testCases: visibleTests,
    });
    setTestResults(result.results || []);
  } catch {
    toast.error('Test execution failed.');
  }
  setTestLoading(false);
};
```

- [ ] **Step 3: Add button + results table to CodingQuestion**

Modify `CodingQuestion` props — add `testResults`, `testLoading`, `onRunAllTests`.

In the `CodingQuestion` component, after the "Run Code" button, add:
```jsx
<Btn
  variant="primary"
  size="sm"
  onClick={onRunAllTests}
  disabled={testLoading || runLoading}
>
  {testLoading ? <Spinner size={14} /> : '▶ Run All Visible Tests'}
</Btn>
```

After the existing run result panel, add the test results table:
```jsx
{testResults && testResults.length > 0 && (
  <div className="panel mt-3 p-3 rounded-lg">
    <div className="text-xs font-mono font-bold text-annotation mb-2">
      Test Results ({testResults.filter(r => r.passed).length}/{testResults.length} passed)
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-annotation/60 border-b border-rim">
            <th className="text-left py-1 pr-2">#</th>
            <th className="text-left py-1 pr-2">Input</th>
            <th className="text-left py-1 pr-2">Expected</th>
            <th className="text-left py-1 pr-2">Got</th>
            <th className="text-right py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {testResults.map((tr, i) => (
            <tr key={i} className="border-b border-rim/50">
              <td className="py-1.5 pr-2 text-annotation">{i + 1}</td>
              <td className="py-1.5 pr-2 text-ink max-w-24 truncate">{tr.input}</td>
              <td className="py-1.5 pr-2 text-ink max-w-24 truncate">{tr.expected}</td>
              <td className="py-1.5 pr-2 text-ink max-w-24 truncate">{tr.actual}</td>
              <td className="py-1.5 text-right">
                <span className={`${tr.passed ? 'text-verify' : 'text-alert'}`}>
                  {tr.passed ? '✅ Pass' : '❌ Fail'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

- [ ] **Step 4: Pass new props through**

In `TestInterface` render, pass the new props to `CodingQuestion`:
```jsx
<CodingQuestion
  ...
  runResult={runResult}
  runLoading={runLoading}
  onRunCode={handleRunCode}
  testResults={testResults}
  testLoading={testLoading}
  onRunAllTests={handleRunAllTests}
  ...
/>
```

Update `CodingQuestion` function signature to accept and use these props.

---

## Task Group C: CSV Import for Questions

### Task C1: Backend — CSV import endpoint

**Files:**
- Modify: `backend/src/controllers/questionBank.js`

**Interfaces:**
- Consumes: uploaded CSV file or pasted CSV text
- Produces: `POST /api/question-bank/import-csv`

- [ ] **Step 1: Add CSV parsing helper**

At the top of `questionBank.js`, add:
```javascript
// ── CSV parsing (stdlib, no dependency) ──────────────────────
const { Readable } = require('stream');
const readline = require('readline');

/**
 * Parse CSV text into array of row objects.
 * Handles basic quoted fields (commas inside quotes).
 */
function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { rows: [], errors: [] };

  const headers = parseCsvLine(lines[0]);
  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      errors.push({ row: i + 1, message: `Expected ${headers.length} columns, got ${values.length}` });
      continue;
    }
    const row = {};
    headers.forEach((h, j) => { row[h.trim()] = (values[j] || '').trim(); });
    rows.push(row);
  }

  return { rows, errors };
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
```

- [ ] **Step 2: Add importCsv controller function**

In `questionBank.js`, add:
```javascript
// ── POST /api/question-bank/import-csv ───────────────────────
// Import questions from CSV text (auto-detect MCQ vs coding by type column)
async function importCsv(req, res) {
  const csvText = req.body.csv || (req.file ? req.file.buffer.toString() : null);
  if (!csvText) return res.status(400).json({ error: 'CSV content required' });

  const { rows, errors: parseErrors } = parseCsv(csvText);
  if (!rows.length) {
    return res.status(400).json({ error: 'No valid rows found', parseErrors });
  }

  const inserted = [];
  const importErrors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (row.type === 'mcq') {
        // Required: text, optionA, optionB, optionC, optionD, correctAnswer
        if (!row.text || !row.optionA || !row.optionB || !row.optionC || !row.optionD || row.correctAnswer === undefined) {
          importErrors.push({ row: i + 2, message: 'MCQ requires: text, optionA-D, correctAnswer' });
          continue;
        }
        const data = {
          text: row.text,
          options: [row.optionA, row.optionB, row.optionC, row.optionD],
          correctAnswer: parseInt(row.correctAnswer),
        };
        const { rows: [q] } = await query(
          `INSERT INTO bank_questions (type, data, genre, difficulty, marks, tags, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          ['mcq', JSON.stringify(data), row.genre || 'general', row.difficulty || 'medium',
           parseInt(row.marks) || 2, null, req.user.id]
        );
        inserted.push(q);
      } else if (row.type === 'coding') {
        // Required: title, description, sampleInput, sampleOutput
        if (!row.title || !row.description) {
          importErrors.push({ row: i + 2, message: 'Coding requires: title, description' });
          continue;
        }
        const data = {
          title: row.title,
          description: row.description,
          sampleInput: row.sampleInput || '',
          sampleOutput: row.sampleOutput || '',
          testCases: row.testCases ? JSON.parse(row.testCases) : [],
        };
        const { rows: [q] } = await query(
          `INSERT INTO bank_questions (type, data, genre, difficulty, marks, tags, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          ['coding', JSON.stringify(data), row.genre || 'general', row.difficulty || 'medium',
           parseInt(row.marks) || 10, null, req.user.id]
        );
        inserted.push(q);
      } else {
        importErrors.push({ row: i + 2, message: `Unknown type "${row.type}" — must be "mcq" or "coding"` });
      }
    } catch (err) {
      importErrors.push({ row: i + 2, message: err.message });
    }
  }

  res.status(201).json({
    message: `Imported ${inserted.length} question(s)`,
    created: inserted.length,
    errors: [...parseErrors, ...importErrors],
  });
}
```

- [ ] **Step 3: Add route**

In `backend/src/routes/index.js`, add:
```javascript
router.post('/question-bank/import-csv', authenticate, requireAdmin, bankCtrl.importCsv);
```

- [ ] **Step 4: Export importCsv**

In `questionBank.js` module.exports, add:
```javascript
importCsv,
```

### Task C2: Frontend — CSV import UI

**Files:**
- Modify: `frontend/src/pages/admin/QuestionBank.jsx`
- Modify: `frontend/src/services/api.js`

- [ ] **Step 1: Add CSV import API**

In `frontend/src/services/api.js`, add to `questionBankAPI`:
```javascript
importCsv: (data) => api.post('/question-bank/import-csv', data).then(r => r.data),
```

- [ ] **Step 2: Add CSV import mode to question bank modal**

In `QuestionBank.jsx`, modify the `McqImportModal` to support both JSON and CSV modes:

Add a mode toggle at the top:
```jsx
const [importMode, setImportMode] = useState('json'); // 'json' | 'csv'
```

Add mode tabs:
```jsx
<div className="flex gap-2 mb-3">
  <button
    onClick={() => setImportMode('json')}
    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
      importMode === 'json' ? 'border-accent bg-accent/10 text-accent' : 'border-rim text-annotation'
    }`}
  >JSON</button>
  <button
    onClick={() => setImportMode('csv')}
    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
      importMode === 'csv' ? 'border-accent bg-accent/10 text-accent' : 'border-rim text-annotation'
    }`}
  >CSV</button>
</div>
```

Conditional content — when `importMode === 'json'`, show existing JSON textarea. When `importMode === 'csv'`, show CSV textarea + file upload:

```jsx
{importMode === 'csv' ? (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <label className="input-label">CSV Data</label>
      <button className="text-xs text-accent hover:underline" onClick={() => setRaw(SAMPLE_CSV)}>Load sample</button>
    </div>
    <textarea
      rows={10}
      value={raw}
      onChange={e => setRaw(e.target.value)}
      className="textarea-field font-mono text-xs"
      placeholder={SAMPLE_CSV_TEXT}
    />
    <div className="flex items-center gap-2">
      <span className="text-xs text-annotation">or upload a .csv file:</span>
      <input
        type="file"
        accept=".csv"
        onChange={e => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setRaw(ev.target.result);
            reader.readAsText(file);
          }
        }}
        className="text-xs text-annotation"
      />
    </div>
  </div>
) : (
  // existing JSON textarea
)}
```

Sample CSV string:
```javascript
const SAMPLE_CSV = `type,text,optionA,optionB,optionC,optionD,correctAnswer,title,description,sampleInput,sampleOutput,testCases,genre,difficulty,marks
mcq,"What is 2+2?",3,4,5,6,1,,,,,,quantitative,easy,2
mcq,"Capital of India?",Delhi,Mumbai,Kolkata,Chennai,0,,,,,,general,easy,2
coding,,,,,,"Two Sum","Find indices summing to target","9\n[2,7,11,15]","[0,1]","[{""input"":""9\n[2,7,11,15]"",""output"":""0 1""}]",,hard,10`;

const SAMPLE_CSV_TEXT = `Paste CSV data here.

Format: type,text,optionA,optionB,optionC,optionD,correctAnswer,title,description,sampleInput,sampleOutput,testCases,genre,difficulty,marks`;
```

---

## Execution Order

All three task groups are **independent** — they don't share state or sequential dependencies. They can be executed in parallel.

Recommended order for single-threaded execution:
1. **Task Group A** (Email) — simplest, touches fewest files
2. **Task Group C** (CSV Import) — moderate, well-bounded
3. **Task Group B** (Code Checker) — most complex, Docker integration
