const logger = require('../services/logger');
const { query, getClient } = require('../db');
const { setActiveSession, getActiveSession, deleteActiveSession, trackActiveUser, getActiveUserCount } = require('../db/redis');
const { judgeSubmission: judge0Judge } = require('../services/judge0');
const { judgeSubmission: dockerJudge, isDockerAvailable } = require('../services/runner');

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
  const { testId, answers, codeSolutions, flaggedQuestions } = req.body;
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

        // Run against hidden test cases using Docker runner, fallback to Judge0
        try {
          const runner = isDockerAvailable() ? dockerJudge : judge0Judge;
          const results = await runner({
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
          logger.error({ err: e }, 'Runner error');
          // Fallback to Judge0 if Docker failed
          try {
            const results = await judge0Judge({
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
          } catch (e2) {
            logger.error({ err: e2 }, 'Judge0 fallback also failed');
            const earned = Math.round(p.marks * 0.1);
            totalScore += earned;
            detailedResults[p.id] = { earned, error: 'Execution service unavailable' };
          }
        }
      }
    }
  }

  const finalScore = Math.max(0, totalScore);
  const elapsed = Math.floor((Date.now() - new Date(submission.started_at).getTime()) / 1000);

  const { rows: [updated] } = await query(
    `UPDATE submissions SET
       status='submitted', score=$1, max_score=$2, answers=$3, code_solutions=$4,
       flagged_questions=$5, code_results=$6, submitted_at=NOW(), time_taken_seconds=$7
     WHERE id=$8 RETURNING *`,
    [finalScore, maxScore, JSON.stringify(answers || {}), JSON.stringify(codeSolutions || {}),
     JSON.stringify(flaggedQuestions || []), JSON.stringify(detailedResults), elapsed, submission.id]
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
    const runner = isDockerAvailable() ? dockerJudge : judge0Judge;
    const results = await runner({
      code, language,
      testCases: testCases.filter(tc => !tc.isHidden),
      timeLimit: timeLimit || 5,
      memoryLimit: memoryLimit || 256,
    });
    return res.json({ results });
  }

  // Single execution (backward compatible)
  if (isDockerAvailable()) {
    const { runCode: dockerRun } = require('../services/runner');
    const result = await dockerRun({ code, language, stdin: stdin || '', timeLimit: timeLimit || 5, memoryLimit: memoryLimit || 256 });
    return res.json(result);
  }
  const { runCode: judgeRun } = require('../services/judge0');
  const result = await judgeRun({ code, language, stdin: stdin || '', timeLimit: 5, memoryLimit: 256 });
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

module.exports = { startTest, saveAnswers, submitTest, getMySubmissions, getTestSubmissions, getSubmission, runCode, deleteSubmission, resumeTest, exportResultsPdf };

// DELETE /api/submissions/:id (admin only)
async function deleteSubmission(req, res) {
  const { id } = req.params;
  
  const { rows } = await query('SELECT id FROM submissions WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
  
  await query('DELETE FROM submissions WHERE id = $1', [id]);
  
  res.json({ message: 'Submission deleted successfully' });
}
