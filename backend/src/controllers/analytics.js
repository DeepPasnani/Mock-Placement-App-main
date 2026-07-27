const { query } = require('../db');
const logger = require('../services/logger');

// ── 1. Cohort Performance Analytics ───────────────────────────

async function getCohortAnalytics(req, res) {
  const { batch_id, year_of_study, department, test_id } = req.query;

  let conditions = ["s.status='submitted'"];
  const params = [];

  if (test_id) { params.push(test_id); conditions.push(`s.test_id=$${params.length}`); }
  if (batch_id) { params.push(batch_id); conditions.push(`b.id=$${params.length}`); }
  if (year_of_study) { params.push(parseInt(year_of_study)); conditions.push(`COALESCE(s.year_snapshot, u.year_of_study)=$${params.length}`); }
  if (department) { params.push(department); conditions.push(`u.department=$${params.length}`); }

  const where = conditions.join(' AND ');

  const { rows: genreData } = await query(`
    SELECT
      COALESCE(s.batch_snapshot, u.batch) as cohort_label,
      q.genre,
      COUNT(DISTINCT q.id) as total_q,
      AVG(CASE WHEN (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}') THEN 1.0 ELSE 0.0 END) as accuracy
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    JOIN tests t ON s.test_id = t.id
    JOIN sections sec ON sec.test_id = t.id
    JOIN questions q ON q.section_id = sec.id
    LEFT JOIN student_batches sb ON sb.user_id = u.id
    LEFT JOIN batches b ON b.id = sb.batch_id
    WHERE ${where}
    GROUP BY cohort_label, q.genre
    ORDER BY cohort_label, q.genre
  `, params);

  const { rows: percentileData } = await query(`
    SELECT
      COALESCE(s.batch_snapshot, u.batch) as cohort_label,
      s.score, s.max_score,
      PERCENT_RANK() OVER (PARTITION BY COALESCE(s.batch_snapshot, u.batch) ORDER BY (s.score / NULLIF(s.max_score, 0)) DESC) as percentile
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN student_batches sb ON sb.user_id = u.id
    LEFT JOIN batches b ON b.id = sb.batch_id
    WHERE ${where} AND s.max_score > 0
  `, params);

  const cohorts = {};
  for (const g of genreData) {
    if (!cohorts[g.cohort_label]) cohorts[g.cohort_label] = {};
    if (!cohorts[g.cohort_label].genres) cohorts[g.cohort_label].genres = [];
    cohorts[g.cohort_label].genres.push({
      genre: g.genre,
      accuracy: Math.round(parseFloat(g.accuracy || 0) * 100),
    });
  }

  const cohortList = Object.entries(cohorts).map(([label, data]) => ({
    label,
    genres: data.genres || [],
  }));

  const percentileBuckets = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const percentileDist = {};
  for (const p of percentileData) {
    if (!percentileDist[p.cohort_label]) percentileDist[p.cohort_label] = {};
    const pct = p.max_score > 0 ? (p.score / p.max_score) * 100 : 0;
    for (const b of percentileBuckets) {
      if (pct <= b) {
        if (!percentileDist[p.cohort_label][b]) percentileDist[p.cohort_label][b] = 0;
        percentileDist[p.cohort_label][b]++;
        break;
      }
    }
  }

  const distribution = Object.entries(percentileDist).map(([label, buckets]) => ({
    label,
    data: percentileBuckets.map(b => ({
      range: `${b - 10}-${b}`,
      count: buckets[b] || 0,
    })),
  }));

  res.json({ cohorts: cohortList, distribution });
}

async function getCohortRadar(req, res) {
  const { batch_id, year_of_study, department, test_id } = req.query;

  let conditions = ["s.status='submitted'"];
  const params = [];

  if (test_id) { params.push(test_id); conditions.push(`s.test_id=$${params.length}`); }
  if (batch_id) { params.push(batch_id); conditions.push(`b.id=$${params.length}`); }
  if (year_of_study) { params.push(parseInt(year_of_study)); conditions.push(`COALESCE(s.year_snapshot, u.year_of_study)=$${params.length}`); }
  if (department) { params.push(department); conditions.push(`u.department=$${params.length}`); }

  const where = conditions.join(' AND ');

  const { rows } = await query(`
    SELECT
      COALESCE(s.batch_snapshot, u.batch) as cohort_label,
      q.genre,
      AVG(CASE WHEN (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}') THEN 1.0 ELSE 0.0 END) as accuracy
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    JOIN tests t ON s.test_id = t.id
    JOIN sections sec ON sec.test_id = t.id
    JOIN questions q ON q.section_id = sec.id
    LEFT JOIN student_batches sb ON sb.user_id = u.id
    LEFT JOIN batches b ON b.id = sb.batch_id
    WHERE ${where}
    GROUP BY cohort_label, q.genre
    ORDER BY cohort_label, q.genre
  `, params);

  const genreSet = [...new Set(rows.map(r => r.genre))];
  const cohortSet = [...new Set(rows.map(r => r.cohort_label))];

  const radarData = cohortSet.map(label => {
    const entry = { cohort: label };
    for (const g of genreSet) {
      const found = rows.find(r => r.cohort_label === label && r.genre === g);
      entry[g] = found ? Math.round(parseFloat(found.accuracy || 0) * 100) : 0;
    }
    return entry;
  });

  res.json({ radarData, genres: genreSet, cohorts: cohortSet });
}

async function getCohortDistribution(req, res) {
  const { batch_id, year_of_study, department, test_id } = req.query;

  let conditions = ["s.status='submitted' AND s.max_score > 0"];
  const params = [];

  if (test_id) { params.push(test_id); conditions.push(`s.test_id=$${params.length}`); }
  if (batch_id) { params.push(batch_id); conditions.push(`b.id=$${params.length}`); }
  if (year_of_study) { params.push(parseInt(year_of_study)); conditions.push(`COALESCE(s.year_snapshot, u.year_of_study)=$${params.length}`); }
  if (department) { params.push(department); conditions.push(`u.department=$${params.length}`); }

  const where = conditions.join(' AND ');

  const { rows } = await query(`
    SELECT
      COALESCE(s.batch_snapshot, u.batch) as cohort_label,
      (s.score / NULLIF(s.max_score, 0)) * 100 as pct
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN student_batches sb ON sb.user_id = u.id
    LEFT JOIN batches b ON b.id = sb.batch_id
    WHERE ${where}
  `, params);

  const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const cohortMap = {};
  for (const r of rows) {
    if (!cohortMap[r.cohort_label]) cohortMap[r.cohort_label] = buckets.slice(0, -1).map((b, i) => ({ range: `${b}-${buckets[i + 1]}`, count: 0 }));
    for (let i = 0; i < buckets.length - 1; i++) {
      if (parseFloat(r.pct) >= buckets[i] && parseFloat(r.pct) < buckets[i + 1]) {
        cohortMap[r.cohort_label][i].count++;
        break;
      }
    }
  }

  res.json({ distribution: Object.entries(cohortMap).map(([label, data]) => ({ label, data })) });
}

// ── 2. Student Growth Trajectories ────────────────────────────

async function getStudentGrowth(req, res) {
  const { userId } = req.params;

  const { rows: tests } = await query(`
    SELECT s.id as submission_id, s.score, s.max_score, s.submitted_at, s.status,
           t.id as test_id, t.title as test_title
    FROM submissions s
    JOIN tests t ON s.test_id = t.id
    WHERE s.user_id=$1 AND s.status IN ('submitted', 'auto_submitted')
    ORDER BY s.submitted_at ASC
  `, [userId]);

  if (tests.length === 0) {
    return res.json({ trend: [], genreMastery: [], percentileHistory: [] });
  }

  const trendData = tests.map((t, i) => ({
    submission_id: t.submission_id,
    test_id: t.test_id,
    test_title: t.test_title,
    submitted_at: t.submitted_at,
    score: t.score,
    max_score: t.max_score,
    percentage: t.max_score > 0 ? Math.round((t.score / t.max_score) * 100) : 0,
    rank: null,
  }));

  const { rows: allSubsForPercentile } = await query(`
    SELECT s.user_id, s.test_id, s.score, s.max_score, s.submitted_at,
           ROW_NUMBER() OVER (PARTITION BY s.test_id ORDER BY (s.score / NULLIF(s.max_score, 0)) DESC) as student_rank,
           COUNT(*) OVER (PARTITION BY s.test_id) as total_students
    FROM submissions s
    WHERE s.test_id = ANY($1::uuid[]) AND s.status IN ('submitted', 'auto_submitted') AND s.max_score > 0
  `, [tests.map(t => t.test_id)]);

  const percentileHistory = allSubsForPercentile
    .filter(s => s.user_id === userId)
    .map(s => ({
      test_id: s.test_id,
      rank: parseInt(s.student_rank),
      total: parseInt(s.total_students),
      percentile: Math.round(((parseInt(s.total_students) - parseInt(s.student_rank)) / parseInt(s.total_students)) * 100),
      score: s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0,
    }));

  const improvementRate = trendData.length >= 2
    ? Math.round((trendData[trendData.length - 1].percentage - trendData[0].percentage) / trendData.length)
    : 0;

  const { rows: genreOverTime } = await query(`
    SELECT s.submitted_at::date as date, q.genre,
           AVG(CASE WHEN (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}') THEN 1.0 ELSE 0.0 END) as accuracy
    FROM submissions s
    JOIN tests t ON s.test_id = t.id
    JOIN sections sec ON sec.test_id = t.id
    JOIN questions q ON q.section_id = sec.id
    WHERE s.user_id=$1 AND s.status IN ('submitted', 'auto_submitted')
    GROUP BY date, q.genre
    ORDER BY date, q.genre
  `, [userId]);

  const genres = [...new Set(genreOverTime.map(g => g.genre))];
  const masteryCurves = genres.map(genre => ({
    genre,
    data: genreOverTime.filter(g => g.genre === genre).map(g => ({
      date: g.date,
      accuracy: Math.round(parseFloat(g.accuracy || 0) * 100),
    })),
  }));

  res.json({
    trend: trendData,
    percentileHistory,
    genreMastery: masteryCurves,
    improvementRate,
  });
}

// ── 3. Topic Difficulty & Discrimination Heatmap ──────────────

async function getQuestionMetrics(req, res) {
  const { testId } = req.params;

  const { rows: questions } = await query(`
    SELECT q.id, q.text, q.genre, q.difficulty, q.marks, q.type,
           COUNT(DISTINCT s.id) as total_attempts,
           SUM(CASE WHEN (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}') THEN 1 ELSE 0 END) as correct_count
    FROM questions q
    JOIN sections sec ON q.section_id = sec.id
    JOIN submissions s ON s.test_id = $1
    WHERE s.status = 'submitted'
    GROUP BY q.id, q.text, q.genre, q.difficulty, q.marks, q.type
    ORDER BY q.genre, q.difficulty, q.id
  `, [testId]);

  const totalAttemptsOverall = questions.reduce((a, q) => a + parseInt(q.total_attempts || 0), 0);
  const totalCorrectOverall = questions.reduce((a, q) => a + parseInt(q.correct_count || 0), 0);
  const overallAveragePct = totalAttemptsOverall > 0 ? totalCorrectOverall / totalAttemptsOverall : 0;

  const metrics = questions.map(q => {
    const total = parseInt(q.total_attempts) || 0;
    const correct = parseInt(q.correct_count) || 0;
    const difficultyIndex = total > 0 ? correct / total : 0;
    const incorrect = total - correct;

    let discriminationIndex = 0;
    if (total >= 5) {
      const sorted = questions
        .filter(x => x.id !== q.id)
        .sort((a, b) => (parseInt(b.correct_count) / Math.max(parseInt(b.total_attempts), 1)) - (parseInt(a.correct_count) / Math.max(parseInt(a.total_attempts), 1)));
      const topN = Math.max(1, Math.floor(sorted.length * 0.27));
      const bottomN = Math.max(1, Math.floor(sorted.length * 0.27));
      const topCorrect = sorted.slice(0, topN).reduce((s, x) => s + parseInt(x.correct_count), 0);
      const bottomCorrect = sorted.slice(-bottomN).reduce((s, x) => s + parseInt(x.correct_count), 0);
      const topTotal = sorted.slice(0, topN).reduce((s, x) => s + parseInt(x.total_attempts), 0);
      const bottomTotal = sorted.slice(-bottomN).reduce((s, x) => s + parseInt(x.total_attempts), 0);
      const topAvg = topTotal > 0 ? topCorrect / topTotal : 0;
      const bottomAvg = bottomTotal > 0 ? bottomCorrect / bottomTotal : 0;
      discriminationIndex = topAvg - bottomAvg;
    }

    const distractorEfficiency = total > 0 && incorrect > 0
      ? Math.max(0, 1 - (incorrect / total))
      : 1;

    return {
      id: q.id,
      text: q.text.length > 100 ? q.text.substring(0, 100) + '...' : q.text,
      genre: q.genre,
      difficulty: q.difficulty,
      marks: q.marks,
      total_attempts: total,
      correct_count: correct,
      difficulty_index: Math.round(difficultyIndex * 100),
      discrimination_index: Math.round(Math.max(0, discriminationIndex) * 100),
      distractor_efficiency: Math.round(distractorEfficiency * 100),
      flagged: difficultyIndex < 0.3 || discriminationIndex < 0.15,
    };
  });

  res.json({ questions: metrics, total: metrics.length });
}

// ── 4. Question Time-Sink Analysis ────────────────────────────

async function getTimeSinkAnalysis(req, res) {
  const { testId } = req.params;

  const { rows: submissions } = await query(`
    SELECT s.id, s.answers, s.flagged_questions, s.time_taken_seconds
    FROM submissions s
    WHERE s.test_id=$1 AND s.status='submitted' AND s.answers IS NOT NULL
  `, [testId]);

  const { rows: questions } = await query(`
    SELECT q.id, q.text, q.genre, q.difficulty, q.marks, q.correct_answer
    FROM questions q
    JOIN sections sec ON q.section_id = sec.id
    WHERE sec.test_id=$1
    ORDER BY q.id
  `, [testId]);

  if (submissions.length === 0) {
    return res.json({ questions: [], testId });
  }

  const totalStudents = submissions.length;
  const timePerQuestion = {};

  for (const sub of submissions) {
    const answers = sub.answers || {};
    const timeTaken = sub.time_taken_seconds || 0;
    const answeredCount = Object.keys(answers).length;
    const timePerQ = answeredCount > 0 ? timeTaken / answeredCount : 0;

    for (const qId of Object.keys(answers)) {
      if (!timePerQuestion[qId]) timePerQuestion[qId] = { totalTime: 0, count: 0, correct: 0 };
      timePerQuestion[qId].totalTime += timePerQ;
      timePerQuestion[qId].count++;

      const q = questions.find(qq => qq.id === qId);
      if (q) {
        const userAns = String(answers[qId] || '');
        const correctAns = String(q.correct_answer ? (q.correct_answer.text || q.correct_answer) : '');
        if (userAns === correctAns) timePerQuestion[qId].correct++;
      }
    }
  }

  const result = questions.map(q => {
    const stats = timePerQuestion[q.id];
    if (!stats || stats.count === 0) return null;
    const avgTime = stats.totalTime / stats.count;
    const accuracy = stats.count > 0 ? stats.correct / stats.count : 0;
    const timeVsAccuracyScore = avgTime > 0
      ? (1 - accuracy) * Math.min(avgTime / 120, 1)
      : 0;
    const isTimeSink = avgTime > 60 && accuracy < 0.4;

    return {
      question_id: q.id,
      text: q.text.length > 100 ? q.text.substring(0, 100) + '...' : q.text,
      genre: q.genre,
      difficulty: q.difficulty,
      avg_time_seconds: Math.round(avgTime * 10) / 10,
      accuracy: Math.round(accuracy * 100),
      attempts: stats.count,
      time_vs_accuracy_score: Math.round(timeVsAccuracyScore * 100),
      is_time_sink: isTimeSink,
    };
  }).filter(Boolean);

  res.json({ questions: result, total_submissions: totalStudents });
}

// ── 5. Predictive Placement Probability ───────────────────────

async function getPlacementProbabilityBatch(req, res) {
  const { batch_id, department, min_test_count } = req.query;
  const minTests = parseInt(min_test_count) || 3;

  let conditions = ["u.role='student'"];
  const params = [];

  if (batch_id) { params.push(batch_id); conditions.push(`b.id=$${params.length}`); }
  if (department) { params.push(department); conditions.push(`u.department=$${params.length}`); }

  const where = conditions.join(' AND ');

  const { rows: students } = await query(`
    SELECT u.id, u.name, u.email, u.branch, u.roll_number,
           COALESCE(u.batch, 'Unknown') as batch_label,
           COUNT(s.id) FILTER (WHERE s.status IN ('submitted', 'auto_submitted')) as test_count,
           AVG(CASE WHEN s.max_score > 0 THEN (s.score / s.max_score) * 100 END) as avg_score,
           AVG(CASE WHEN s.max_score > 0 AND (s.score / s.max_score) * 100 >= 40 THEN 1 ELSE 0 END) as pass_rate
    FROM users u
    LEFT JOIN submissions s ON s.user_id = u.id
    LEFT JOIN student_batches sb ON sb.user_id = u.id
    LEFT JOIN batches b ON b.id = sb.batch_id
    WHERE ${where}
    GROUP BY u.id, u.name, u.email, u.branch, u.roll_number, u.batch
    HAVING COUNT(s.id) FILTER (WHERE s.status IN ('submitted', 'auto_submitted')) >= $${params.length + 1}
  `, [...params, minTests]);

  const probabilities = students.map(s => {
    const avgScore = parseFloat(s.avg_score || 0);
    const passRate = parseFloat(s.pass_rate || 0);
    const testCount = parseInt(s.test_count) || 0;

    const scoreFactor = avgScore / 100;
    const passFactor = passRate;
    const consFactor = Math.min(testCount / 10, 1);

    let probability = (scoreFactor * 0.5 + passFactor * 0.3 + consFactor * 0.2) * 100;
    probability = Math.round(Math.min(100, Math.max(0, probability)));

    let confidence = 'low';
    if (testCount >= 8) confidence = 'high';
    else if (testCount >= 5) confidence = 'medium';

    let recommendation = '';
    if (probability < 30) recommendation = 'Intensive preparation needed. Focus on fundamentals.';
    else if (probability < 50) recommendation = 'Needs improvement in key areas. Practice mock tests regularly.';
    else if (probability < 70) recommendation = 'On track. Focus on weak genres to improve further.';
    else recommendation = 'Strong candidate. Maintain current performance.';

    return {
      user_id: s.id, name: s.name, email: s.email, branch: s.branch,
      roll_number: s.roll_number, batch: s.batch_label,
      avg_score: Math.round(avgScore), pass_rate: Math.round(passRate * 100),
      test_count: testCount,
      probability, confidence, recommendation,
    };
  });

  const distribution = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const distData = distribution.slice(0, -1).map((b, i) => ({
    range: `${b}-${distribution[i + 1]}`,
    count: probabilities.filter(p => p.probability >= b && p.probability < distribution[i + 1]).length,
  }));

  const avgProbability = probabilities.length
    ? Math.round(probabilities.reduce((a, p) => a + p.probability, 0) / probabilities.length)
    : 0;

  res.json({
    students: probabilities,
    distribution: distData,
    total: probabilities.length,
    avg_probability: avgProbability,
    high_confidence_count: probabilities.filter(p => p.confidence === 'high').length,
    low_probability_count: probabilities.filter(p => p.probability < 40).length,
  });
}

async function getPlacementProbabilityStudent(req, res) {
  const { userId } = req.params;

  const { rows: [student] } = await query(`
    SELECT u.id, u.name, u.email, u.branch, u.roll_number, u.batch
    FROM users u WHERE u.id=$1 AND u.role='student'
  `, [userId]);

  if (!student) return res.status(404).json({ error: 'Student not found' });

  const { rows: submissions } = await query(`
    SELECT s.score, s.max_score, s.submitted_at, s.status, t.title
    FROM submissions s JOIN tests t ON s.test_id = t.id
    WHERE s.user_id=$1 AND s.status IN ('submitted', 'auto_submitted')
    ORDER BY s.submitted_at ASC
  `, [userId]);

  const testCount = submissions.length;
  if (testCount === 0) {
    return res.json({
      student, probability: 0, confidence: 'low',
      recommendation: 'No test data available. Complete at least one test for a prediction.',
      focus_areas: [], test_count: 0,
    });
  }

  const scores = submissions.map(s => s.max_score > 0 ? (s.score / s.max_score) * 100 : 0);
  const avgScore = scores.reduce((a, s) => a + s, 0) / scores.length;
  const passed = scores.filter(s => s >= 40).length;
  const passRate = passed / scores.length;

  const recent = scores.slice(-3);
  const older = scores.slice(0, -3);
  let improvementRate = 0;
  if (recent.length > 0 && older.length > 0) {
    const recentAvg = recent.reduce((a, s) => a + s, 0) / recent.length;
    const olderAvg = older.reduce((a, s) => a + s, 0) / older.length;
    improvementRate = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
  }

  const scoreFactor = avgScore / 100;
  const passFactor = passRate;
  const consFactor = Math.min(testCount / 10, 1);
  const improvFactor = Math.max(0, Math.min(improvementRate, 0.3));

  let probability = (scoreFactor * 0.4 + passFactor * 0.25 + consFactor * 0.2 + improvFactor * 0.15) * 100;
  probability = Math.round(Math.min(100, Math.max(0, probability)));

  let confidence = 'low';
  if (testCount >= 8) confidence = 'high';
  else if (testCount >= 5) confidence = 'medium';

  let recommendation = '';
  if (probability < 30) recommendation = 'Intensive preparation needed. Focus on fundamentals and take more mock tests.';
  else if (probability < 50) recommendation = 'Needs improvement. Practice regularly and work on weak areas.';
  else if (probability < 70) recommendation = 'On track. Identify and strengthen weaker genres.';
  else recommendation = 'Well prepared. Maintain consistency and keep practicing.';

  const { rows: genreData } = await query(`
    SELECT q.genre,
      AVG(CASE WHEN (sub.answers->>q.id::text)::text = (q.correct_answer#>>'{}') THEN 1.0 ELSE 0.0 END) as accuracy
    FROM submissions sub
    JOIN tests t ON sub.test_id = t.id
    JOIN sections sec ON sec.test_id = t.id
    JOIN questions q ON q.section_id = sec.id
    WHERE sub.user_id=$1 AND sub.status IN ('submitted', 'auto_submitted')
    GROUP BY q.genre
    ORDER BY accuracy ASC
  `, [userId]);

  const focusAreas = genreData
    .filter(g => parseFloat(g.accuracy || 0) < 0.5)
    .map(g => g.genre);

  res.json({
    student,
    probability,
    confidence,
    recommendation,
    focus_areas: focusAreas,
    avg_score: Math.round(avgScore),
    pass_rate: Math.round(passRate * 100),
    test_count: testCount,
    improvement_rate: Math.round(improvementRate * 100),
    genre_accuracies: genreData,
  });
}

// ── 6. Custom Report Builder ──────────────────────────────────

async function reportBuilder(req, res) {
  const { metrics, filters, dateRange, groupBy } = req.body;

  let conditions = ["s.status='submitted'"];
  const params = [];

  if (filters) {
    if (filters.batch_id) { params.push(filters.batch_id); conditions.push(`b.id=$${params.length}`); }
    if (filters.department) { params.push(filters.department); conditions.push(`u.department=$${params.length}`); }
    if (filters.year_of_study) { params.push(parseInt(filters.year_of_study)); conditions.push(`COALESCE(s.year_snapshot, u.year_of_study)=$${params.length}`); }
    if (filters.test_id) { params.push(filters.test_id); conditions.push(`s.test_id=$${params.length}`); }
    if (filters.min_score) { params.push(parseFloat(filters.min_score)); conditions.push(`s.score >= $${params.length}`); }
    if (filters.max_score) { params.push(parseFloat(filters.max_score)); conditions.push(`s.score <= $${params.length}`); }
  }

  if (dateRange) {
    if (dateRange.start) { params.push(dateRange.start); conditions.push(`s.submitted_at >= $${params.length}`); }
    if (dateRange.end) { params.push(dateRange.end); conditions.push(`s.submitted_at <= $${params.length}`); }
  }

  const where = conditions.join(' AND ');

  const groupColumn = groupBy === 'batch' ? "COALESCE(s.batch_snapshot, u.batch)"
    : groupBy === 'department' ? "u.department"
    : groupBy === 'year' ? "COALESCE(s.year_snapshot::text, u.year_of_study::text)"
    : "'Overall'";

  const selects = [`${groupColumn} as group_label`];
  const having = [];

  if (!metrics || metrics.includes('avg_score')) selects.push("AVG(s.score) as avg_score");
  if (!metrics || metrics.includes('avg_percentage')) selects.push("AVG((s.score / NULLIF(s.max_score, 0)) * 100) as avg_percentage");
  if (!metrics || metrics.includes('completion_rate')) selects.push("COUNT(*) as total_submissions");
  if (!metrics || metrics.includes('coding_score')) selects.push("AVG((s.code_results->>'earned')::numeric) as avg_coding_score");
  if (!metrics || metrics.includes('genre_accuracy')) {
    const { rows: genreRows } = await query(`
      SELECT ${groupColumn} as group_label, q.genre,
        AVG(CASE WHEN (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}') THEN 1.0 ELSE 0.0 END) as accuracy
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      JOIN tests t ON s.test_id = t.id
      JOIN sections sec ON sec.test_id = t.id
      JOIN questions q ON q.section_id = sec.id
      LEFT JOIN student_batches sb ON sb.user_id = u.id
      LEFT JOIN batches b ON b.id = sb.batch_id
      WHERE ${where}
      GROUP BY group_label, q.genre
      ORDER BY group_label, q.genre
    `, params);
    return res.json({ type: 'genre_accuracy', data: genreRows, groupBy });
  }

  const finalSelects = selects.join(', ');
  const groupClause = groupBy ? `GROUP BY group_label` : '';

  const { rows: data } = await query(`
    SELECT ${finalSelects}
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    JOIN tests t ON s.test_id = t.id
    LEFT JOIN student_batches sb ON sb.user_id = u.id
    LEFT JOIN batches b ON b.id = sb.batch_id
    WHERE ${where}
    ${groupClause}
    ORDER BY group_label
  `, params);

  const resultData = data.map(d => ({
    ...d,
    avg_percentage: d.avg_percentage ? Math.round(parseFloat(d.avg_percentage)) : null,
    avg_score: d.avg_score ? Math.round(parseFloat(d.avg_score) * 100) / 100 : null,
  }));

  res.json({ type: 'tabular', data: resultData, metrics, groupBy });
}

// ── 7. Scheduled Auto-Reports ─────────────────────────────────

async function createScheduledReport(req, res) {
  const { name, config, schedule, recipients, enabled } = req.body;
  if (!name || !config || !schedule || !recipients) {
    return res.status(400).json({ error: 'name, config, schedule and recipients required' });
  }

  const { rows: [report] } = await query(`
    INSERT INTO scheduled_reports (name, config, schedule, recipients, enabled, created_by, next_send_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 day')
    RETURNING *
  `, [name, JSON.stringify(config), schedule, JSON.stringify(recipients), enabled !== false, req.user.id]);

  res.status(201).json({ report });
}

async function listScheduledReports(req, res) {
  const { rows } = await query(`
    SELECT * FROM scheduled_reports ORDER BY created_at DESC
  `);
  res.json({ reports: rows });
}

async function updateScheduledReport(req, res) {
  const { id } = req.params;
  const { name, config, schedule, recipients, enabled } = req.body;

  const fields = [];
  const params = [];
  if (name !== undefined) { params.push(name); fields.push(`name=$${params.length}`); }
  if (config !== undefined) { params.push(JSON.stringify(config)); fields.push(`config=$${params.length}`); }
  if (schedule !== undefined) { params.push(schedule); fields.push(`schedule=$${params.length}`); }
  if (recipients !== undefined) { params.push(JSON.stringify(recipients)); fields.push(`recipients=$${params.length}`); }
  if (enabled !== undefined) { params.push(enabled); fields.push(`enabled=$${params.length}`); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(id);
  const { rows: [report] } = await query(
    `UPDATE scheduled_reports SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`,
    params
  );

  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json({ report });
}

async function deleteScheduledReport(req, res) {
  const { id } = req.params;
  const { rowCount } = await query('DELETE FROM scheduled_reports WHERE id=$1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'Report not found' });
  res.json({ message: 'Report deleted' });
}

// ── Threshold Alerts ──────────────────────────────────────────

async function createThresholdAlert(req, res) {
  const { name, student_id, threshold_pct, email_recipients, enabled } = req.body;
  if (!name || !student_id || threshold_pct === undefined) {
    return res.status(400).json({ error: 'name, student_id and threshold_pct required' });
  }

  const { rows: [alert] } = await query(`
    INSERT INTO threshold_alerts (name, student_id, threshold_pct, email_recipients, enabled, created_by)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
  `, [name, student_id, threshold_pct, JSON.stringify(email_recipients || []), enabled !== false, req.user.id]);

  res.status(201).json({ alert });
}

async function listThresholdAlerts(req, res) {
  const { rows } = await query(`
    SELECT ta.*, u.name as student_name, u.email as student_email, u.roll_number
    FROM threshold_alerts ta
    JOIN users u ON u.id = ta.student_id
    ORDER BY ta.created_at DESC
  `);
  res.json({ alerts: rows });
}

async function updateThresholdAlert(req, res) {
  const { id } = req.params;
  const { name, threshold_pct, email_recipients, enabled } = req.body;

  const fields = [];
  const params = [];
  if (name !== undefined) { params.push(name); fields.push(`name=$${params.length}`); }
  if (threshold_pct !== undefined) { params.push(threshold_pct); fields.push(`threshold_pct=$${params.length}`); }
  if (email_recipients !== undefined) { params.push(JSON.stringify(email_recipients)); fields.push(`email_recipients=$${params.length}`); }
  if (enabled !== undefined) { params.push(enabled); fields.push(`enabled=$${params.length}`); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(id);
  const { rows: [alert] } = await query(
    `UPDATE threshold_alerts SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`,
    params
  );

  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json({ alert });
}

async function deleteThresholdAlert(req, res) {
  const { id } = req.params;
  const { rowCount } = await query('DELETE FROM threshold_alerts WHERE id=$1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'Alert not found' });
  res.json({ message: 'Alert deleted' });
}

// ── 8. Natural Language Insight Summaries ─────────────────────

async function getNLSummary(req, res) {
  const { testId } = req.params;

  const { rows: [test] } = await query('SELECT * FROM tests WHERE id=$1', [testId]);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  const { rows: submissions } = await query(`
    SELECT s.*, u.name as user_name
    FROM submissions s JOIN users u ON s.user_id = u.id
    WHERE s.test_id=$1 AND s.status IN ('submitted', 'auto_submitted')
    ORDER BY s.score DESC
  `, [testId]);

  if (submissions.length === 0) {
    return res.json({
      summary_paragraph: `No submissions yet for "${test.title}".`,
      highlights: [],
      improvements: [],
      comparisons: {},
    });
  }

  const scored = submissions.filter(s => s.max_score > 0);
  const avgPct = scored.length
    ? Math.round(scored.reduce((a, s) => a + (s.score / s.max_score) * 100, 0) / scored.length)
    : 0;
  const passed = scored.filter(s => (s.score / s.max_score) * 100 >= 40).length;
  const passRate = scored.length ? Math.round((passed / scored.length) * 100) : 0;

  const topPerformer = scored[0];
  const topPct = topPerformer ? Math.round((topPerformer.score / topPerformer.max_score) * 100) : 0;
  const bottomPerformer = scored[scored.length - 1];
  const bottomPct = bottomPerformer ? Math.round((bottomPerformer.score / bottomPerformer.max_score) * 100) : 0;

  const { rows: genreData } = await query(`
    SELECT q.genre,
      AVG(CASE WHEN (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}') THEN 1.0 ELSE 0.0 END) as accuracy
    FROM submissions s
    JOIN sections sec ON sec.test_id = $1
    JOIN questions q ON q.section_id = sec.id
    WHERE s.test_id=$1 AND s.status='submitted'
    GROUP BY q.genre
    ORDER BY accuracy DESC
  `, [testId]);

  const bestGenre = genreData[0];
  const worstGenre = genreData[genreData.length - 1];

  const { rows: prevTest } = await query(`
    SELECT AVG((s.score / NULLIF(s.max_score, 0)) * 100) as prev_avg
    FROM submissions s
    WHERE s.test_id IN (SELECT id FROM tests WHERE department=$1 AND id != $2 AND status='published' LIMIT 1)
      AND s.status='submitted'
  `, [test.department, testId]);

  const comparisonData = {};
  if (prevTest[0]?.prev_avg) {
    const prevAvg = parseFloat(prevTest[0].prev_avg);
    comparisonData.previous_test_avg = Math.round(prevAvg);
    comparisonData.change = avgPct - Math.round(prevAvg);
    comparisonData.change_direction = comparisonData.change >= 0 ? 'higher' : 'lower';
  }

  let summary = `The average score for "${test.title}" was ${avgPct}%, with a pass rate of ${passRate}%. `;
  summary += `${scored.length} students submitted the test. `;
  summary += `${topPerformer.user_name} scored the highest at ${topPct}%. `;

  if (bestGenre) {
    summary += `Students performed best in ${bestGenre.genre} (${Math.round(parseFloat(bestGenre.accuracy) * 100)}% accuracy) `;
  }
  if (worstGenre && worstGenre.genre !== bestGenre.genre) {
    summary += `and struggled most with ${worstGenre.genre} (${Math.round(parseFloat(worstGenre.accuracy) * 100)}% accuracy).`;
  }

  if (comparisonData.change !== undefined) {
    summary += ` Compared to the previous test, this batch scored ${comparisonData.change_direction} by ${Math.abs(comparisonData.change)} percentage points.`;
  }

  const highlights = [
    `${scored.length} students completed the test`,
    `Top score: ${topPct}% by ${topPerformer.user_name}`,
    `Pass rate: ${passRate}%`,
    comparisonData.change !== undefined
      ? comparisonData.change >= 0 ? `Score improved by ${comparisonData.change}% over previous test` : `Score dropped by ${Math.abs(comparisonData.change)}% from previous test`
      : null,
  ].filter(Boolean);

  const improvements = genreData
    .filter(g => parseFloat(g.accuracy || 0) < 0.5)
    .map(g => `${g.genre} (${Math.round(parseFloat(g.accuracy) * 100)}% accuracy)`);

  if (improvements.length === 0) {
    improvements.push('Maintain current performance across all genres');
  }

  res.json({
    summary_paragraph: summary,
    highlights,
    improvements: improvements.length > 0 ? improvements : ['No significant improvement areas identified'],
    comparisons: comparisonData,
    stats: { avg_percentage: avgPct, pass_rate: passRate, total_submissions: scored.length, top_score: topPct },
  });
}

module.exports = {
  getCohortAnalytics, getCohortRadar, getCohortDistribution,
  getStudentGrowth,
  getQuestionMetrics,
  getTimeSinkAnalysis,
  getPlacementProbabilityBatch, getPlacementProbabilityStudent,
  reportBuilder,
  createScheduledReport, listScheduledReports, updateScheduledReport, deleteScheduledReport,
  createThresholdAlert, listThresholdAlerts, updateThresholdAlert, deleteThresholdAlert,
  getNLSummary,
};
