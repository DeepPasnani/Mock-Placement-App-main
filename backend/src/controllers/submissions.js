const logger = require('../services/logger');
const { query, getClient } = require('../db');
const { setActiveSession, getActiveSession, deleteActiveSession, trackActiveUser, getActiveUserCount } = require('../db/redis');
const { judgeSubmission: codeJudge, isDockerAvailable } = require('../services/runner');

// POST /api/submissions/start
async function startTest(req, res) {
  const { testId } = req.body;
  const userId = req.user.id;

  // Check existing submission
  const { rows: existing } = await query(
    "SELECT * FROM submissions WHERE test_id=$1 AND user_id=$2",
    [testId, userId]
  );

  if (existing[0]?.status === 'submitted' || existing[0]?.status === 'auto_submitted') {
    return res.status(400).json({ error: 'You have already submitted this test.' });
  }

  // Validate test is active
  const { rows: testRows } = await query(
    "SELECT * FROM tests WHERE id=$1 AND status='published'", [testId]
  );
  const test = testRows[0];
  if (!test) return res.status(404).json({ error: 'Test not found or not available.' });

  const now = new Date();
  if (test.start_time && now < new Date(test.start_time)) return res.status(400).json({ error: 'Test has not started yet.' });
  if (test.end_time && now > new Date(test.end_time)) return res.status(400).json({ error: 'Test has ended.' });

  // Create or resume submission
  let submission;
  if (existing[0]) {
    submission = existing[0];
  } else {
    const { rows } = await query(
      `INSERT INTO submissions (test_id, user_id, status, ip_address, batch_snapshot, year_snapshot)
       VALUES ($1,$2,'in_progress',$3,$4,$5) RETURNING *`,
      [testId, userId, req.ip, req.user.batch || null, req.user.year_of_study || null]
    );
    submission = rows[0];
  }

  // Track in Redis
  const startedAt = submission.started_at;
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const remaining = (test.duration_minutes * 60) - elapsed;

  await setActiveSession(userId, testId, {
    submissionId: submission.id, startedAt, remainingSeconds: remaining
  });
  await trackActiveUser(testId, userId);

  const activeCount = await getActiveUserCount(testId);

  res.json({
    submission,
    remainingSeconds: Math.max(0, remaining),
    activeUsers: activeCount,
  });
}

// POST /api/submissions/save-answers  (auto-save every 30s)
async function saveAnswers(req, res) {
  const { testId, answers, codeSolutions, flaggedQuestions, tabSwitchCount, selectedProblems } = req.body;
  const userId = req.user.id;

  const session = await getActiveSession(userId, testId);
  if (!session) return res.status(400).json({ error: 'No active test session found.' });

  const updateFields = [];
  const params = [];
  let idx = 0;

  if (answers !== undefined) { params.push(JSON.stringify(answers || {})); updateFields.push(`answers=$${++idx}`); }
  if (codeSolutions !== undefined) { params.push(JSON.stringify(codeSolutions || {})); updateFields.push(`code_solutions=$${++idx}`); }
  if (flaggedQuestions !== undefined) { params.push(JSON.stringify(flaggedQuestions || [])); updateFields.push(`flagged_questions=$${++idx}`); }
  if (tabSwitchCount !== undefined) { params.push(tabSwitchCount); updateFields.push(`tab_switch_count=$${++idx}`); }
  if (selectedProblems !== undefined) { params.push(JSON.stringify(selectedProblems || [])); updateFields.push(`selected_problems=$${++idx}`); }

  if (!updateFields.length) return res.status(400).json({ error: 'Nothing to save' });

  params.push(testId, userId);
  await query(
    `UPDATE submissions SET ${updateFields.join(', ')}
     WHERE test_id=$${idx+1} AND user_id=$${idx+2} AND status='in_progress'`,
    params
  );

  res.json({ saved: true });
}

// POST /api/submissions/submit
async function submitTest(req, res) {
  const { testId, answers, codeSolutions, flaggedQuestions, tabSwitchCount, selectedProblems, autoSubmitted } = req.body;
  const userId = req.user.id;

  const { rows: subRows } = await query(
    "SELECT * FROM submissions WHERE test_id=$1 AND user_id=$2", [testId, userId]
  );
  const submission = subRows[0];
  if (!submission) return res.status(404).json({ error: 'Submission not found.' });
  if (submission.status !== 'in_progress') return res.status(400).json({ error: 'Test already submitted.' });

  // Load test + correct answers for grading
  const { rows: testRows } = await query('SELECT * FROM tests WHERE id=$1', [testId]);
  const test = testRows[0];
  const { rows: sections } = await query('SELECT * FROM sections WHERE test_id=$1 ORDER BY order_index', [testId]);

  // Server-authoritative timer check
  const elapsedSec = Math.floor((Date.now() - new Date(submission.started_at).getTime()) / 1000);
  const maxDurationSec = test.duration_minutes * 60;
  const timeExpired = elapsedSec >= maxDurationSec;

  // Server-side tab-switch limit check
  const effectiveTabCount = tabSwitchCount !== undefined ? tabSwitchCount : submission.tab_switch_count;
  const tabSwitchLimit = 5;
  const tabLimitExceeded = effectiveTabCount >= tabSwitchLimit;

  if (timeExpired || tabLimitExceeded) {
    const reason = timeExpired ? 'Time expired' : 'Tab switch limit exceeded';
    const { rows: [autoSub] } = await query(
      `UPDATE submissions SET
         status='auto_submitted', tab_switch_count=$1, submitted_at=NOW(), time_taken_seconds=$2
       WHERE id=$3 RETURNING *`,
      [Math.max(effectiveTabCount, submission.tab_switch_count), elapsedSec, submission.id]
    );
    await deleteActiveSession(userId, testId);
    return res.json({
      submission: autoSub,
      score: 0, maxScore: 0, percentage: 0, passed: false,
      autoSubmitted: true,
      reason,
    });
  }

  // Server-side validation of coding problem selection
  for (const section of sections) {
    if (section.type === 'coding') {
      const { rows: problems } = await query(
        'SELECT id, difficulty FROM coding_problems WHERE section_id=$1', [section.id]
      );
      if (problems.length > 3) {
        const selectedForSection = (selectedProblems || []).filter(pid =>
          problems.some(p => p.id === pid)
        );
        if (selectedForSection.length > 3) {
          return res.status(400).json({ error: 'Cannot select more than 3 coding problems.' });
        }
        const easySelected = problems.filter(p =>
          p.difficulty === 'easy' && selectedForSection.includes(p.id)
        ).length;
        const hardSelected = problems.filter(p =>
          p.difficulty === 'hard' && selectedForSection.includes(p.id)
        ).length;
        if (easySelected > 2) {
          return res.status(400).json({ error: 'Cannot select more than 2 easy coding problems.' });
        }
        if (hardSelected > 1) {
          return res.status(400).json({ error: 'Cannot select more than 1 hard coding problem.' });
        }
        // Store validated selection
        if (!req.body.codeSolutions) req.body.codeSolutions = {};
        if (req.body.codeSolutions && typeof req.body.codeSolutions === 'object') {
          // Only grade selected problems
          const validatedSolutions = {};
          for (const pid of selectedForSection) {
            if (req.body.codeSolutions[pid]) {
              validatedSolutions[pid] = req.body.codeSolutions[pid];
            }
          }
          // Merge back
          for (const pid of Object.keys(req.body.codeSolutions)) {
            if (!selectedForSection.includes(pid) || !problems.some(p => p.id === pid)) {
              delete req.body.codeSolutions[pid];
            }
          }
        }
      }
    }
  }

  let totalScore = 0;
  let maxScore = 0;
  const detailedResults = {};

  for (const section of sections) {
    if (section.type === 'aptitude') {
      const { rows: questions } = await query(
        'SELECT id, type, correct_answer, marks FROM questions WHERE section_id=$1', [section.id]
      );
      for (const q of questions) {
        maxScore += q.marks;
        const userAnswer = (answers || {})[q.id];
        if (userAnswer === undefined || userAnswer === null || userAnswer === '') continue;

        const correct = q.correct_answer;
        let earned = 0;

        if (q.type === 'msq') {
          const ua = (Array.isArray(userAnswer) ? userAnswer : [userAnswer]).map(String).sort();
          const ca = (Array.isArray(correct) ? correct : [correct]).map(String).sort();
          if (JSON.stringify(ua) === JSON.stringify(ca)) earned = q.marks;
          else if (test.settings?.negativeMarking) earned = -(q.marks * (test.settings.negativeFraction || 0.25));
        } else {
          if (String(userAnswer) === String(correct)) earned = q.marks;
          else if (test.settings?.negativeMarking) earned = -(q.marks * (test.settings.negativeFraction || 0.25));
        }

        totalScore += earned;
        detailedResults[q.id] = { earned, correct };
      }
    } else {
      const { rows: problems } = await query(
        'SELECT id, marks, test_cases, time_limit_seconds, memory_limit_mb FROM coding_problems WHERE section_id=$1', [section.id]
      );
      for (const p of problems) {
        maxScore += p.marks;
        const sol = (codeSolutions || {})[p.id];
        if (!sol) continue;

        const lang = Object.keys(sol).find(l => sol[l]?.trim());
        if (!lang || !sol[lang]?.trim()) continue;

        // Run against hidden test cases using the built-in Docker runner
        try {
          const results = await codeJudge({
            code: sol[lang], language: lang,
            testCases: p.test_cases || [],
            timeLimit: p.time_limit_seconds,
            memoryLimit: p.memory_limit_mb,
          });
          const passed = results.filter(r => r.passed).length;
          const total = results.length || 1;
          const earned = Math.round((passed / total) * p.marks);
          totalScore += earned;
          detailedResults[p.id] = { earned, passed, total, results: results.filter(r => !r.hidden) };
        } catch (e) {
          logger.error({ err: e }, 'Code execution error');
          const earned = Math.round(p.marks * 0.1);
          totalScore += earned;
          detailedResults[p.id] = { earned, error: 'Execution service unavailable' };
        }
      }
    }
  }

  const finalScore = Math.max(0, totalScore);
  const elapsed = Math.floor((Date.now() - new Date(submission.started_at).getTime()) / 1000);
  const newStatus = autoSubmitted ? 'auto_submitted' : 'submitted';
  const finalTabCount = tabSwitchCount !== undefined ? tabSwitchCount : submission.tab_switch_count;

  const finalSelectedProblems = selectedProblems !== undefined ? selectedProblems : submission.selected_problems;

  const { rows: [updated] } = await query(
    `UPDATE submissions SET
       status=$1, score=$2, max_score=$3, answers=$4, code_solutions=$5,
       flagged_questions=$6, code_results=$7, submitted_at=NOW(), time_taken_seconds=$8,
       tab_switch_count=$9, selected_problems=$10
     WHERE id=$11 RETURNING *`,
    [newStatus, finalScore, maxScore, JSON.stringify(answers || {}), JSON.stringify(codeSolutions || {}),
     JSON.stringify(flaggedQuestions || []), JSON.stringify(detailedResults), elapsed, finalTabCount,
     JSON.stringify(finalSelectedProblems || []), submission.id]
  );

  await deleteActiveSession(userId, testId);

  const pct = maxScore > 0 ? Math.round((finalScore / maxScore) * 100) : 0;
  const passed = pct >= (test.settings?.passingScore || 40);

  res.json({
    submission: updated,
    score: finalScore,
    maxScore,
    percentage: pct,
    passed,
    details: test.settings?.showResults === 'after_submit' ? detailedResults : null,
  });
}

// GET /api/submissions/my
async function getMySubmissions(req, res) {
  const { rows } = await query(
    `SELECT s.*, t.title as test_title, t.settings as test_settings
     FROM submissions s JOIN tests t ON s.test_id = t.id
     WHERE s.user_id=$1 ORDER BY s.submitted_at DESC NULLS LAST`,
    [req.user.id]
  );
  res.json({ submissions: rows });
}

// GET /api/submissions/test/:testId (admin)
async function getTestSubmissions(req, res) {
  const { rows } = await query(
    `SELECT s.*, u.name as user_name, u.email as user_email, u.branch, u.roll_number,
       COALESCE(s.batch_snapshot, u.batch) as batch_display,
       COALESCE(s.year_snapshot, u.year_of_study) as year_display
     FROM submissions s JOIN users u ON s.user_id = u.id
     WHERE s.test_id=$1 ORDER BY s.score DESC NULLS LAST`,
    [req.params.testId]
  );
  res.json({ submissions: rows });
}

// GET /api/submissions/:id (detail)
async function getSubmission(req, res) {
  const { rows } = await query(
    `SELECT s.*, u.name as user_name, t.title as test_title, t.settings as test_settings
     FROM submissions s JOIN users u ON s.user_id=u.id JOIN tests t ON s.test_id=t.id
     WHERE s.id=$1`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
  const sub = rows[0];

  // Students can only see their own
  if (req.user.role !== 'admin' && sub.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json({ submission: sub });
}

// POST /api/submissions/run-code (live code testing)
// Also supports testCases array for per-test-case results
async function runCode(req, res) {
  const { code, language, stdin, testCases, timeLimit, memoryLimit } = req.body;
  if (!code || !language) return res.status(400).json({ error: 'Code and language required' });

  if (testCases && Array.isArray(testCases) && testCases.length > 0) {
    // Run against each visible test case
    const results = await codeJudge({
      code, language,
      testCases: testCases.filter(tc => !tc.isHidden),
      timeLimit: timeLimit || 5,
      memoryLimit: memoryLimit || 256,
    });
    return res.json({ results });
  }

  // Single execution using the built-in Docker runner
  const { runCode: dockerRun } = require('../services/runner');
  const result = await dockerRun({ code, language, stdin: stdin || '', timeLimit: timeLimit || 5, memoryLimit: memoryLimit || 256 });
  res.json(result);
}

// ── POST /api/submissions/resume/:id (admin only) ──────────
// Admin can resume a student's auto-submitted test, preserving remaining time
async function resumeTest(req, res) {
  const { id } = req.params;

  const { rows: subRows } = await query('SELECT * FROM submissions WHERE id = $1', [id]);
  if (!subRows.length) return res.status(404).json({ error: 'Submission not found' });

  const sub = subRows[0];
  if (sub.status !== 'auto_submitted' && sub.status !== 'submitted') {
    return res.status(400).json({ error: 'Only submitted/auto-submitted tests can be resumed' });
  }

  // Calculate remaining time: original duration - time already taken
  const { rows: [test] } = await query('SELECT * FROM tests WHERE id = $1', [sub.test_id]);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  const elapsed = sub.time_taken_seconds || 0;
  const remaining = Math.max(0, (test.duration_minutes * 60) - elapsed);

  if (remaining <= 0) {
    return res.status(400).json({ error: 'Test duration has already expired. Cannot resume.' });
  }

  // Reset to in_progress, update resumed_at
  const { rows: [updated] } = await query(
    `UPDATE submissions SET
       status = 'in_progress',
       resumed_at = NOW(),
       submitted_at = NULL
     WHERE id = $1 RETURNING *`,
    [id]
  );

  // Re-activate Redis session
  const { setActiveSession, trackActiveUser } = require('../db/redis');
  await setActiveSession(sub.user_id, sub.test_id, {
    submissionId: sub.id,
    startedAt: sub.started_at,
    remainingSeconds: remaining,
  });
  await trackActiveUser(sub.test_id, sub.user_id);

  res.json({
    submission: updated,
    remainingSeconds: remaining,
    message: 'Test resumed successfully. Student can continue from where they left off.',
  });
}

// GET /api/submissions/test/:testId/export-pdf (admin) — formatted summary report
async function exportResultsPdf(req, res) {
  const { testId } = req.params;

  const { rows: testRows } = await query('SELECT * FROM tests WHERE id=$1', [testId]);
  if (!testRows.length) return res.status(404).json({ error: 'Test not found' });
  const test = testRows[0];

  const { rows: submissions } = await query(
    `SELECT s.*, u.name as user_name, u.email as user_email, u.branch, u.roll_number,
       COALESCE(s.batch_snapshot, u.batch) as batch_display
     FROM submissions s JOIN users u ON s.user_id = u.id
     WHERE s.test_id=$1 ORDER BY s.score DESC NULLS LAST`,
    [testId]
  );

  const batches = [...new Set(submissions.map(s => s.batch_display).filter(Boolean))].sort();
  const classBreakdown = batches.map(b => {
    const rows = submissions.filter(s => s.batch_display === b && s.status === 'submitted' && s.max_score > 0);
    const avg = rows.length ? Math.round(rows.reduce((a, s) => a + (s.score / s.max_score) * 100, 0) / rows.length) : 0;
    const passed = rows.filter(s => (s.score / s.max_score) * 100 >= (test.settings?.passingScore || 40)).length;
    return { batch: b, count: rows.length, avg, passRate: rows.length ? Math.round((passed / rows.length) * 100) : 0 };
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="campustrack_${test.title.replace(/[^a-z0-9]+/gi, '_')}_results.pdf"`);

  const { buildResultsPdf } = require('../services/pdfReport');
  buildResultsPdf({ test, submissions, classBreakdown }, res);
}

// GET /api/submissions/test/:testId/export-csv (admin)
async function exportResultsCsv(req, res) {
  const { testId } = req.params;
  const { batch } = req.query;

  const { rows: testRows } = await query('SELECT * FROM tests WHERE id=$1', [testId]);
  if (!testRows.length) return res.status(404).json({ error: 'Test not found' });
  const test = testRows[0];

  let subQuery = `
    SELECT s.*, u.name as user_name, u.email as user_email, u.branch, u.roll_number,
           COALESCE(s.batch_snapshot, u.batch) as batch_display,
           COALESCE(s.year_snapshot, u.year_of_study) as year_display
    FROM submissions s JOIN users u ON s.user_id = u.id
    WHERE s.test_id=$1`;
  const params = [testId];

  if (batch && batch !== 'all') {
    params.push(batch);
    subQuery += ` AND COALESCE(s.batch_snapshot, u.batch)=$${params.length}`;
  }

  subQuery += ' ORDER BY s.score DESC NULLS LAST';

  const { rows: submissions } = await query(subQuery, params);

  const csvRows = [];
  csvRows.push(['Rank', 'Name', 'Email', 'Roll No', 'Branch', 'Batch', 'Year',
    'Score', 'Max', 'Percentage', 'Result', 'Time Taken (s)', 'Submitted At', 'Status',
    'Tab Switches'].join(','));

  const ranked = [...submissions].sort((a, b) => {
    const aScore = a.status === 'submitted' ? (a.score || 0) : -1;
    const bScore = b.status === 'submitted' ? (b.score || 0) : -1;
    return bScore - aScore;
  });

  ranked.forEach((s, i) => {
    const pct = s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0;
    const escaped = (v) => {
      const str = String(v ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };
    csvRows.push([
      escaped(i + 1),
      escaped(s.user_name),
      escaped(s.user_email),
      escaped(s.roll_number),
      escaped(s.branch),
      escaped(s.batch_display),
      escaped(s.year_display),
      escaped(s.score),
      escaped(s.max_score),
      escaped(`${pct}%`),
      escaped(pct >= 40 ? 'Pass' : s.status === 'submitted' ? 'Fail' : '—'),
      escaped(s.time_taken_seconds),
      escaped(s.submitted_at ? new Date(s.submitted_at).toISOString() : ''),
      escaped(s.status),
      escaped(s.tab_switch_count),
    ].join(','));
  });

  const csv = csvRows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="campustrack_${test.title.replace(/[^a-z0-9]+/gi, '_')}_results.csv"`);
  res.send(csv);
}

// DELETE /api/submissions/:id (admin only)
async function deleteSubmission(req, res) {
  const { id } = req.params;
  
  const { rows } = await query('SELECT id FROM submissions WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
  
  await query('DELETE FROM submissions WHERE id = $1', [id]);
  
  res.json({ message: 'Submission deleted successfully' });
}

// ── GET /api/submissions/question-analytics ─────────────────
// Question difficulty analytics — flag MCQs that students
// consistently answer incorrectly.
async function getQuestionAnalytics(req, res) {
  const { test_id, threshold } = req.query;
  const incorrectThreshold = parseFloat(threshold) || 0.6;

  let whereClause = "WHERE s.status='submitted' AND q.type='mcq'";
  const params = [];

  if (test_id) {
    params.push(test_id);
    whereClause += ` AND s.test_id=$${params.length}`;
  }

  const { rows: questions } = await query(`
    SELECT q.id, q.text, q.genre, q.difficulty, q.marks, q.explanation,
           COUNT(DISTINCT s.id) as total_attempts,
           SUM(CASE WHEN (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}') THEN 1 ELSE 0 END) as correct_count,
           SUM(CASE WHEN (s.answers->>q.id::text) IS NOT NULL AND (s.answers->>q.id::text) != '' THEN 1 ELSE 0 END) as attempted_count
    FROM questions q
    JOIN sections sec ON q.section_id = sec.id
    JOIN submissions s ON s.test_id IN (SELECT id FROM tests WHERE id IN (SELECT test_id FROM sections WHERE id = sec.id))
    ${whereClause}
    GROUP BY q.id, q.text, q.genre, q.difficulty, q.marks, q.explanation
    HAVING COUNT(DISTINCT s.id) >= 3
    ORDER BY (COUNT(DISTINCT s.id) - SUM(CASE WHEN (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}') THEN 1 ELSE 0 END))::float / NULLIF(COUNT(DISTINCT s.id), 0) DESC
  `, params);

  const flagged = questions.map(q => {
    const total = parseInt(q.total_attempts) || 0;
    const correct = parseInt(q.correct_count) || 0;
    const incorrectRate = total > 0 ? (total - correct) / total : 0;
    return {
      id: q.id,
      text: q.text.length > 200 ? q.text.substring(0, 200) + '...' : q.text,
      genre: q.genre,
      difficulty: q.difficulty,
      marks: q.marks,
      explanation: q.explanation,
      total_attempts: total,
      correct_count: correct,
      attempted_count: parseInt(q.attempted_count) || 0,
      incorrect_rate: Math.round(incorrectRate * 100),
      flagged: incorrectRate >= incorrectThreshold,
    };
  });

  res.json({
    threshold: incorrectThreshold,
    total_questions: flagged.length,
    flagged_count: flagged.filter(q => q.flagged).length,
    questions: flagged,
  });
}

// ── GET /api/submissions/plagiarism-check/:testId ──────────
// Plagiarism/similarity detection across code submissions.
function normalizeCode(code) {
  return code
    .replace(/\/\/.*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'.*?'/g, '')
    .replace(/".*?"/g, '')
    .replace(/\b\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(public|private|protected|static|final|const|let|var|function|def|int|float|double|char|void|string|boolean|return|if|else|for|while|do|switch|case|break|continue|import|from|class|struct|enum|interface|extends|implements|new|this|super|try|catch|throw|throws|package)\b/g, '')
    .trim()
    .toLowerCase();
}

function tokenize(source) {
  return source
    .replace(/[{}();,.[\]<>!=+\-*/%&|^~?:]/g, ' $& ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

function jaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function levenshteinSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - (dp[a.length][b.length] / maxLen);
}

async function checkPlagiarism(req, res) {
  const { testId } = req.params;
  const { threshold = 0.7 } = req.query;
  const similarityThreshold = parseFloat(threshold);

  const { rows: submissions } = await query(`
    SELECT s.id, s.user_id, s.code_solutions, s.selected_problems,
           u.name as user_name, u.email, u.roll_number
    FROM submissions s JOIN users u ON s.user_id = u.id
    WHERE s.test_id=$1 AND s.status='submitted'
  `, [testId]);

  const codeEntries = [];
  for (const sub of submissions) {
    const solutions = sub.code_solutions || {};
    for (const probId of Object.keys(solutions)) {
      const sol = solutions[probId];
      if (!sol) continue;
      const lang = Object.keys(sol).find(l => sol[l]?.trim());
      if (!lang || !sol[lang]?.trim()) continue;
      codeEntries.push({
        submissionId: sub.id, userId: sub.user_id,
        userName: sub.user_name, email: sub.email,
        rollNumber: sub.roll_number, problemId: probId,
        language: lang, code: sol[lang],
      });
    }
  }

  const pairs = [];
  for (let i = 0; i < codeEntries.length; i++) {
    for (let j = i + 1; j < codeEntries.length; j++) {
      const a = codeEntries[i], b = codeEntries[j];
      if (a.problemId !== b.problemId || a.language !== b.language) continue;

      const normA = normalizeCode(a.code);
      const normB = normalizeCode(b.code);
      if (normA.length < 20 || normB.length < 20) continue;

      const jaccard = jaccardSimilarity(tokenize(normA), tokenize(normB));
      const levenshtein = levenshteinSimilarity(normA, normB);
      const combined = (jaccard * 0.5 + levenshtein * 0.5);

      if (combined >= similarityThreshold) {
        pairs.push({
          student_a: { name: a.userName, email: a.email, roll: a.rollNumber },
          student_b: { name: b.userName, email: b.email, roll: b.rollNumber },
          problem_id: a.problemId, language: a.language,
          similarity: Math.round(combined * 100),
          jaccard: Math.round(jaccard * 100),
          levenshtein: Math.round(levenshtein * 100),
          code_a: a.code.substring(0, 500),
          code_b: b.code.substring(0, 500),
        });
      }
    }
  }

  pairs.sort((a, b) => b.similarity - a.similarity);

  res.json({
    total_submissions: submissions.length,
    total_code_entries: codeEntries.length,
    threshold: similarityThreshold,
    flagged_pairs: pairs.length,
    pairs: pairs.slice(0, 100),
  });
}

// ── POST /api/submissions/fingerprint ──────────────────────
async function submitFingerprint(req, res) {
  const { submissionId, fingerprint } = req.body;
  if (!submissionId || !fingerprint) {
    return res.status(400).json({ error: 'submissionId and fingerprint required' });
  }

  const fpHash = require('crypto').createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');

  await query(
    `UPDATE submissions SET fingerprint_hash=$1, device_fingerprint=$2 WHERE id=$3`,
    [fpHash, JSON.stringify(fingerprint), submissionId]
  );

  res.json({ hash: fpHash, stored: true });
}

// ── POST /api/submissions/fingerprint/verify ──────────────
async function verifyFingerprint(req, res) {
  const { submissionId, fingerprint, previousFingerprint } = req.body;
  if (!submissionId || !fingerprint) {
    return res.status(400).json({ error: 'submissionId and fingerprint required' });
  }

  const { rows } = await query('SELECT fingerprint_hash, device_fingerprint FROM submissions WHERE id=$1', [submissionId]);
  if (!rows.length) return res.status(404).json({ error: 'Submission not found' });

  const stored = rows[0];
  const fpHash = require('crypto').createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
  const match = fpHash === stored.fingerprint_hash;

  if (!match && stored.fingerprint_hash) {
    await query(
      `INSERT INTO suspicious_flags (test_id, submission_id, suspicion_score, reasons)
       VALUES ($1, $2, 50, $3)`,
      [
        req.body.testId || 'unknown',
        submissionId,
        JSON.stringify([{ type: 'fingerprint_mismatch', detail: 'Device fingerprint changed during test', timestamp: new Date().toISOString() }])
      ]
    );
  }

  res.json({ valid: match, hash: fpHash });
}

// ── POST /api/submissions/fullscreen-violation ──────────
async function logFullscreenViolation(req, res) {
  const { submissionId, exitCount } = req.body;
  if (!submissionId) return res.status(400).json({ error: 'submissionId required' });

  await query(
    `UPDATE submissions SET fullscreen_exit_count=$1 WHERE id=$2`,
    [exitCount || 0, submissionId]
  );

  if (exitCount >= 3) {
    await query(
      `INSERT INTO suspicious_flags (test_id, submission_id, suspicion_score, reasons)
       VALUES ($1, $2, 80, $3)`,
      [
        req.body.testId || 'unknown',
        submissionId,
        JSON.stringify([{ type: 'fullscreen_violation', detail: `Fullscreen exited ${exitCount} times`, timestamp: new Date().toISOString() }])
      ]
    );
  }

  res.json({ logged: true });
}

// ── GET /api/submissions/time-bomb-status ────────────────
async function getTimeBombStatus(req, res) {
  const { testId } = req.query;
  if (!testId) return res.status(400).json({ error: 'testId required' });

  const { rows: sections } = await query(
    'SELECT id FROM sections WHERE test_id=$1 AND type=$2',
    [testId, 'aptitude']
  );

  const bombs = [];
  for (const section of sections) {
    const { rows: questions } = await query(
      "SELECT id, time_bomb FROM questions WHERE section_id=$1 AND time_bomb->>'enabled' = 'true'",
      [section.id]
    );
    for (const q of questions) {
      const tb = q.time_bomb || {};
      bombs.push({
        questionId: q.id,
        enabled: tb.enabled || false,
        durationSeconds: tb.duration_seconds || 0,
      });
    }
  }

  const { rows: [sub] } = await query(
    'SELECT started_at FROM submissions WHERE test_id=$1 AND user_id=$2 AND status=$3 ORDER BY started_at DESC LIMIT 1',
    [testId, req.user.id, 'in_progress']
  );

  const startedAt = sub ? new Date(sub.started_at).getTime() : Date.now();
  const now = Date.now();
  const elapsed = Math.floor((now - startedAt) / 1000);

  const bombStatus = bombs.map(b => ({
    ...b,
    expiresInSeconds: Math.max(0, b.durationSeconds - elapsed),
    expired: elapsed >= b.durationSeconds,
  }));

  res.json({ bombs: bombStatus, elapsedSeconds: elapsed });
}

module.exports = { startTest, saveAnswers, submitTest, getMySubmissions, getTestSubmissions, getSubmission, runCode, deleteSubmission, resumeTest, exportResultsPdf, exportResultsCsv, getQuestionAnalytics, checkPlagiarism, submitFingerprint, verifyFingerprint, logFullscreenViolation, getTimeBombStatus };
