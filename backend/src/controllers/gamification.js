const { query } = require('../db');
const logger = require('../services/logger');

const XP_PER_LEVEL_BASE = 100;
const XP_GROWTH_RATE = 1.5;

function getXpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(XP_PER_LEVEL_BASE * (Math.pow(XP_GROWTH_RATE, level - 1) - 1) / (XP_GROWTH_RATE - 1));
}

function getLevelFromXp(xp) {
  let level = 1;
  while (getXpForLevel(level + 1) <= xp) level++;
  return level;
}

function getLevelThresholds(limit = 50) {
  const levels = [];
  for (let i = 1; i <= limit; i++) {
    levels.push({ level: i, xpRequired: getXpForLevel(i) });
  }
  return levels;
}

async function ensureStudentXp(userId) {
  await query(
    `INSERT INTO student_xp (user_id, xp_points, level) VALUES ($1, 0, 1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function awardXp(userId, amount, reason, referenceType = null, referenceId = null) {
  await ensureStudentXp(userId);

  const { rows: [xpRow] } = await query(
    `UPDATE student_xp SET xp_points = xp_points + $1, updated_at = NOW()
     WHERE user_id = $2 RETURNING xp_points`,
    [amount, userId]
  );

  const newLevel = getLevelFromXp(xpRow.xp_points);

  await query(
    `UPDATE student_xp SET level = $1 WHERE user_id = $2`,
    [newLevel, userId]
  );

  await query(
    `INSERT INTO xp_transactions (user_id, amount, reason, reference_type, reference_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, amount, reason, referenceType, referenceId]
  );

  return { xp_points: xpRow.xp_points, level: newLevel, xp_awarded: amount };
}

async function checkAndAwardAchievements(userId) {
  const { rows: existing } = await query(
    `SELECT ad.key FROM student_achievements sa
     JOIN achievement_definitions ad ON ad.id = sa.achievement_id
     WHERE sa.user_id = $1`,
    [userId]
  );
  const earned = new Set(existing.map(r => r.key));

  const awards = [];

  if (!earned.has('first_test')) {
    const { rows: [subCheck] } = await query(
      `SELECT COUNT(*)::int as cnt FROM submissions WHERE user_id = $1 AND status IN ('submitted', 'auto_submitted')`,
      [userId]
    );
    if (subCheck.cnt >= 1) {
      const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'first_test'`);
      if (def) awards.push(def.id);
    }
  }

  if (!earned.has('score_90')) {
    const { rows: [scoreCheck] } = await query(
      `SELECT COUNT(*)::int as cnt FROM submissions WHERE user_id = $1 AND status IN ('submitted', 'auto_submitted') AND max_score > 0 AND (score / max_score) * 100 >= 90`,
      [userId]
    );
    if (scoreCheck.cnt >= 1) {
      const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'score_90'`);
      if (def) awards.push(def.id);
    }
  }

  if (!earned.has('streak_7') || !earned.has('streak_30')) {
    const { rows: [streakRow] } = await query(
      `SELECT longest_streak FROM streaks WHERE user_id = $1`,
      [userId]
    );
    if (streakRow) {
      if (!earned.has('streak_7') && streakRow.longest_streak >= 7) {
        const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'streak_7'`);
        if (def) awards.push(def.id);
      }
      if (!earned.has('streak_30') && streakRow.longest_streak >= 30) {
        const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'streak_30'`);
        if (def) awards.push(def.id);
      }
    }
  }

  if (!earned.has('three_hard')) {
    const { rows: [hardCheck] } = await query(
      `SELECT COUNT(*)::int as cnt FROM submissions s
       JOIN sections sec ON sec.test_id = s.test_id
       JOIN coding_problems cp ON cp.section_id = sec.id AND cp.difficulty = 'hard'
       WHERE s.user_id = $1 AND s.status IN ('submitted', 'auto_submitted')`,
      [userId]
    );
    if (hardCheck.cnt >= 3) {
      const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'three_hard'`);
      if (def) awards.push(def.id);
    }
  }

  if (!earned.has('daily_champion')) {
    const { rows: [dcCheck] } = await query(
      `SELECT COUNT(*)::int as cnt FROM daily_challenge_submissions WHERE user_id = $1 AND correct = true`,
      [userId]
    );
    if (dcCheck.cnt >= 1) {
      const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'daily_champion'`);
      if (def) awards.push(def.id);
    }
  }

  if (!earned.has('xp_1000')) {
    const { rows: [xpRow] } = await query(`SELECT xp_points FROM student_xp WHERE user_id = $1`, [userId]);
    if (xpRow && xpRow.xp_points >= 1000) {
      const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'xp_1000'`);
      if (def) awards.push(def.id);
    }
  }

  if (!earned.has('xp_5000')) {
    const { rows: [xpRow] } = await query(`SELECT xp_points FROM student_xp WHERE user_id = $1`, [userId]);
    if (xpRow && xpRow.xp_points >= 5000) {
      const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'xp_5000'`);
      if (def) awards.push(def.id);
    }
  }

  if (!earned.has('level_5')) {
    const { rows: [xpRow] } = await query(`SELECT level FROM student_xp WHERE user_id = $1`, [userId]);
    if (xpRow && xpRow.level >= 5) {
      const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'level_5'`);
      if (def) awards.push(def.id);
    }
  }

  if (!earned.has('level_10')) {
    const { rows: [xpRow] } = await query(`SELECT level FROM student_xp WHERE user_id = $1`, [userId]);
    if (xpRow && xpRow.level >= 10) {
      const { rows: [def] } = await query(`SELECT id FROM achievement_definitions WHERE key = 'level_10'`);
      if (def) awards.push(def.id);
    }
  }

  for (const achievementId of awards) {
    await query(
      `INSERT INTO student_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, achievementId]
    );
  }

  if (awards.length > 0) {
    const { rows: awardedDefs } = await query(
      `SELECT * FROM achievement_definitions WHERE id = ANY($1::uuid[])`,
      [awards]
    );
    return awardedDefs;
  }
  return [];
}

async function awardXpHandler(req, res) {
  try {
    const { userId, amount, reason } = req.body;
    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }
    if (amount <= 0 || amount > 10000) {
      return res.status(400).json({ error: 'Amount must be between 1 and 10000' });
    }

    const result = await awardXp(userId, amount, reason || 'Manual award', 'manual');
    const newAchievements = await checkAndAwardAchievements(userId);

    res.json({ ...result, newAchievements });
  } catch (err) {
    logger.error({ err }, 'awardXp error');
    res.status(500).json({ error: 'Failed to award XP' });
  }
}

async function getMyStats(req, res) {
  try {
    await ensureStudentXp(req.user.id);

    const { rows: [xpRow] } = await query(
      `SELECT * FROM student_xp WHERE user_id = $1`,
      [req.user.id]
    );

    const currentLevelXp = getXpForLevel(xpRow.level);
    const nextLevelXp = getXpForLevel(xpRow.level + 1);
    const xpInCurrentLevel = xpRow.xp_points - currentLevelXp;
    const xpNeededForNext = nextLevelXp - currentLevelXp;

    const { rows: [streakRow] } = await query(
      `SELECT * FROM streaks WHERE user_id = $1`,
      [req.user.id]
    );

    const { rows: txnRecent } = await query(
      `SELECT * FROM xp_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );

    const { rows: achievementCount } = await query(
      `SELECT COUNT(*)::int as earned FROM student_achievements WHERE user_id = $1`,
      [req.user.id]
    );
    const { rows: [totalAchievements] } = await query(
      `SELECT COUNT(*)::int as total FROM achievement_definitions`
    );

    res.json({
      xp: {
        current: xpRow.xp_points,
        level: xpRow.level,
        currentLevelXp,
        nextLevelXp,
        xpInCurrentLevel,
        xpNeededForNext,
        progress: xpNeededForNext > 0 ? Math.round((xpInCurrentLevel / xpNeededForNext) * 100) : 100,
      },
      streak: streakRow || { current_streak: 0, longest_streak: 0, last_activity_date: null },
      recentTransactions: txnRecent,
      achievements: {
        earned: achievementCount.earned,
        total: totalAchievements.total,
      },
    });
  } catch (err) {
    logger.error({ err }, 'getMyStats error');
    res.status(500).json({ error: 'Failed to get stats' });
  }
}

async function getLeaderboard(req, res) {
  try {
    const { type = 'alltime', batch, class: className } = req.query;
    const params = [];

    const filters = [`u.role = 'student'`, `u.is_active = true`];
    if (batch) { params.push(batch); filters.push(`u.batch = $${params.length}`); }
    if (className) { params.push(className); filters.push(`u.branch = $${params.length}`); }

    // For 'alltime' we can read the running total straight off student_xp.
    // For 'weekly' / 'test' we need to sum the relevant xp_transactions rows
    // instead, since student_xp only holds the all-time total.
    let xpJoin = '';
    let xpExpr = 'COALESCE(sx.xp_points, 0)';
    let groupBy = '';

    if (type === 'test') {
      const { rows: [lastTest] } = await query(
        `SELECT id FROM tests WHERE status = 'published' AND end_time <= NOW() ORDER BY end_time DESC LIMIT 1`
      );
      if (!lastTest) return res.json({ leaderboard: [], type, myRank: null });

      params.push(lastTest.id);
      xpJoin = `LEFT JOIN xp_transactions xt ON xt.user_id = u.id
                   AND xt.reference_type = 'submission' AND xt.reference_id = $${params.length}`;
      xpExpr = 'COALESCE(SUM(xt.amount), 0)';
      groupBy = 'GROUP BY u.id, u.name, u.email, u.avatar_url, u.branch, u.batch, u.roll_number, sx.level';
    } else if (type === 'weekly') {
      params.push(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
      xpJoin = `LEFT JOIN xp_transactions xt ON xt.user_id = u.id AND xt.created_at >= $${params.length}`;
      xpExpr = 'COALESCE(SUM(xt.amount), 0)';
      groupBy = 'GROUP BY u.id, u.name, u.email, u.avatar_url, u.branch, u.batch, u.roll_number, sx.level';
    }

    const { rows: leaderboard } = await query(`
      SELECT
        u.id, u.name, u.email, u.avatar_url, u.branch, u.batch, u.roll_number,
        ${xpExpr} as xp_points,
        COALESCE(sx.level, 1) as level,
        ROW_NUMBER() OVER (ORDER BY ${xpExpr} DESC) as rank
      FROM users u
      LEFT JOIN student_xp sx ON sx.user_id = u.id
      ${xpJoin}
      WHERE ${filters.join(' AND ')}
      ${groupBy}
      ORDER BY ${xpExpr} DESC
      LIMIT 100
    `, params);

    const myRank = leaderboard.findIndex(r => r.id === req.user.id) + 1;

    res.json({ leaderboard, myRank: myRank || null, type });
  } catch (err) {
    logger.error({ err }, 'getLeaderboard error');
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
}

async function getLevels(req, res) {
  res.json({ levels: getLevelThresholds(50) });
}

async function getAchievements(req, res) {
  try {
    const { rows: definitions } = await query(`SELECT * FROM achievement_definitions ORDER BY key`);

    const { rows: earned } = await query(
      `SELECT achievement_id, earned_at FROM student_achievements WHERE user_id = $1`,
      [req.user.id]
    );
    const earnedMap = {};
    for (const e of earned) earnedMap[e.achievement_id] = e.earned_at;

    const results = definitions.map(d => ({
      ...d,
      earned: !!earnedMap[d.id],
      earnedAt: earnedMap[d.id] || null,
    }));

    res.json({ achievements: results });
  } catch (err) {
    logger.error({ err }, 'getAchievements error');
    res.status(500).json({ error: 'Failed to get achievements' });
  }
}

async function getAchievementWall(req, res) {
  try {
    const { userId } = req.params;

    const { rows: earned } = await query(
      `SELECT ad.*, sa.earned_at FROM student_achievements sa
       JOIN achievement_definitions ad ON ad.id = sa.achievement_id
       WHERE sa.user_id = $1
       ORDER BY sa.earned_at DESC`,
      [userId]
    );

    const { rows: [user] } = await query(
      `SELECT id, name, email, avatar_url FROM users WHERE id = $1`,
      [userId]
    );

    const { rows: [xpRow] } = await query(
      `SELECT xp_points, level FROM student_xp WHERE user_id = $1`,
      [userId]
    );

    res.json({
      user: user || { id: userId },
      achievements: earned,
      xp: xpRow || { xp_points: 0, level: 1 },
    });
  } catch (err) {
    logger.error({ err }, 'getAchievementWall error');
    res.status(500).json({ error: 'Failed to get achievement wall' });
  }
}

async function checkin(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { rows: [existing] } = await query(
      `SELECT * FROM streaks WHERE user_id = $1`,
      [req.user.id]
    );

    if (existing && existing.last_activity_date === today) {
      const { rows: [xpRow] } = await query(
        `SELECT xp_points FROM student_xp WHERE user_id = $1`,
        [req.user.id]
      );
      return res.json({ message: 'Already checked in today', streak: existing, xp: xpRow });
    }

    let newCurrentStreak = 1;
    let newLongestStreak = existing?.longest_streak || 0;

    if (existing) {
      const lastDate = existing.last_activity_date;
      if (lastDate) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        newCurrentStreak = lastDate === yesterday ? existing.current_streak + 1 : 1;
      }
      newLongestStreak = Math.max(newLongestStreak, newCurrentStreak);
    }

    await query(
      `INSERT INTO streaks (user_id, current_streak, longest_streak, last_activity_date)
       VALUES ($1, $2, $3, $4::date)
       ON CONFLICT (user_id) DO UPDATE SET
         current_streak = EXCLUDED.current_streak,
         longest_streak = EXCLUDED.longest_streak,
         last_activity_date = EXCLUDED.last_activity_date`,
      [req.user.id, newCurrentStreak, newLongestStreak, today]
    );

    let bonusXp = 5;
    let bonusReason = 'Daily check-in';
    if (newCurrentStreak === 7) {
      bonusXp = 50;
      bonusReason = '7-day streak bonus!';
    } else if (newCurrentStreak === 30) {
      bonusXp = 200;
      bonusReason = '30-day streak bonus!';
    } else if (newCurrentStreak > 0 && newCurrentStreak % 7 === 0) {
      bonusXp = 50;
      bonusReason = `${newCurrentStreak}-day streak bonus!`;
    }

    const result = await awardXp(req.user.id, bonusXp, bonusReason, 'checkin');
    const newAchievements = await checkAndAwardAchievements(req.user.id);

    const { rows: [streakRow] } = await query(
      `SELECT * FROM streaks WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      streak: streakRow,
      xpAwarded: bonusXp,
      bonusReason,
      xp: result,
      newAchievements,
    });
  } catch (err) {
    logger.error({ err }, 'checkin error');
    res.status(500).json({ error: 'Failed to check in' });
  }
}

async function getStreak(req, res) {
  try {
    const { rows: [streakRow] } = await query(
      `SELECT * FROM streaks WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({ streak: streakRow || { current_streak: 0, longest_streak: 0, last_activity_date: null } });
  } catch (err) {
    logger.error({ err }, 'getStreak error');
    res.status(500).json({ error: 'Failed to get streak' });
  }
}

async function getHeatmap(req, res) {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { rows: data } = await query(
      `SELECT DATE(created_at) as date, SUM(amount) as total_xp, COUNT(*) as count
       FROM xp_transactions
       WHERE user_id = $1 AND created_at >= $2::date AND created_at <= $3::date
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [req.user.id, startDate, endDate]
    );

    const { rows: checkinDays } = await query(
      `SELECT last_activity_date as date FROM streaks WHERE user_id = $1 AND last_activity_date IS NOT NULL`,
      [req.user.id]
    );

    res.json({ heatmap: data, checkinDays: checkinDays.map(d => d.date ? d.date.toISOString().split('T')[0] : null).filter(Boolean) });
  } catch (err) {
    logger.error({ err }, 'getHeatmap error');
    res.status(500).json({ error: 'Failed to get heatmap' });
  }
}

async function getDailyChallenge(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];

    let { rows: [challenge] } = await query(
      `SELECT * FROM daily_challenges WHERE date = $1::date`,
      [today]
    );

    if (!challenge) {
      return res.json({ challenge: null, message: 'No challenge available today' });
    }

    let questionData = null;
    if (challenge.type === 'mcq') {
      const { rows } = await query(
        `SELECT id, text, options, genre, difficulty, marks, explanation FROM questions WHERE id = $1`,
        [challenge.question_id]
      );
      if (rows.length) questionData = rows[0];
    } else if (challenge.type === 'coding') {
      const { rows } = await query(
        `SELECT id, title, description, input_format, output_format, constraints, sample_input, sample_output, difficulty, marks FROM coding_problems WHERE id = $1`,
        [challenge.question_id]
      );
      if (rows.length) questionData = rows[0];
    }

    const { rows: [submission] } = await query(
      `SELECT * FROM daily_challenge_submissions WHERE challenge_id = $1 AND user_id = $2`,
      [challenge.id, req.user.id]
    );

    res.json({
      challenge: {
        ...challenge,
        question: questionData,
        submitted: !!submission,
        correct: submission?.correct || false,
      },
    });
  } catch (err) {
    logger.error({ err }, 'getDailyChallenge error');
    res.status(500).json({ error: 'Failed to get daily challenge' });
  }
}

async function submitDailyChallenge(req, res) {
  try {
    const { challengeId, answer } = req.body;

    const { rows: [challenge] } = await query(
      `SELECT * FROM daily_challenges WHERE id = $1`,
      [challengeId]
    );
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const { rows: [existing] } = await query(
      `SELECT * FROM daily_challenge_submissions WHERE challenge_id = $1 AND user_id = $2`,
      [challengeId, req.user.id]
    );
    if (existing) return res.status(400).json({ error: 'Already submitted' });

    let correct = false;
    if (challenge.type === 'mcq') {
      const { rows: [question] } = await query(
        `SELECT correct_answer FROM questions WHERE id = $1`,
        [challenge.question_id]
      );
      if (question) {
        const correctAns = typeof question.correct_answer === 'string'
          ? JSON.parse(question.correct_answer) : question.correct_answer;
        correct = JSON.stringify(answer) === JSON.stringify(correctAns);
      }
    } else {
      correct = true;
    }

    await query(
      `INSERT INTO daily_challenge_submissions (challenge_id, user_id, answer, correct)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [challengeId, req.user.id, JSON.stringify(answer), correct]
    );

    const xpReward = correct ? challenge.xp_reward : Math.floor(challenge.xp_reward / 2);
    const result = await awardXp(req.user.id, xpReward, correct ? 'Daily challenge completed' : 'Daily challenge attempted', 'daily_challenge', challengeId);
    const newAchievements = await checkAndAwardAchievements(req.user.id);

    res.json({
      correct,
      xpAwarded: xpReward,
      xp: result,
      newAchievements,
    });
  } catch (err) {
    logger.error({ err }, 'submitDailyChallenge error');
    res.status(500).json({ error: 'Failed to submit daily challenge' });
  }
}

async function listStudyResources(req, res) {
  try {
    const { type, genre } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (type) {
      params.push(type);
      where += ` AND r.type = $${params.length}`;
    }
    if (genre) {
      params.push(genre);
      where += ` AND r.genre = $${params.length}`;
    }

    const { rows: resources } = await query(`
      SELECT r.*,
        u.name as created_by_name,
        CASE WHEN rc.id IS NOT NULL THEN true ELSE false END as completed
      FROM study_resources r
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN resource_completions rc ON rc.resource_id = r.id AND rc.user_id = $${params.length + 1}
      ${where}
      ORDER BY r.created_at DESC
    `, [...params, req.user.id]);

    res.json({ resources });
  } catch (err) {
    logger.error({ err }, 'listStudyResources error');
    res.status(500).json({ error: 'Failed to list resources' });
  }
}

async function createStudyResource(req, res) {
  try {
    const { title, description, type, genre, url } = req.body;
    if (!title || !type || !url) {
      return res.status(400).json({ error: 'title, type, and url are required' });
    }

    const { rows: [resource] } = await query(
      `INSERT INTO study_resources (title, description, type, genre, url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, description, type, genre, url, req.user.id]
    );

    res.status(201).json({ resource });
  } catch (err) {
    logger.error({ err }, 'createStudyResource error');
    res.status(500).json({ error: 'Failed to create resource' });
  }
}

async function updateStudyResource(req, res) {
  try {
    const { id } = req.params;
    const { title, description, type, genre, url } = req.body;

    const { rows: [resource] } = await query(
      `UPDATE study_resources SET title = COALESCE($1, title), description = COALESCE($2, description),
       type = COALESCE($3, type), genre = COALESCE($4, genre), url = COALESCE($5, url)
       WHERE id = $6 RETURNING *`,
      [title, description, type, genre, url, id]
    );

    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    res.json({ resource });
  } catch (err) {
    logger.error({ err }, 'updateStudyResource error');
    res.status(500).json({ error: 'Failed to update resource' });
  }
}

async function deleteStudyResource(req, res) {
  try {
    const { rows } = await query(`DELETE FROM study_resources WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Resource not found' });
    res.json({ message: 'Resource deleted' });
  } catch (err) {
    logger.error({ err }, 'deleteStudyResource error');
    res.status(500).json({ error: 'Failed to delete resource' });
  }
}

async function completeStudyResource(req, res) {
  try {
    const { id } = req.params;

    const { rows: [existing] } = await query(
      `SELECT * FROM resource_completions WHERE resource_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (existing) return res.json({ message: 'Already completed' });

    await query(
      `INSERT INTO resource_completions (resource_id, user_id) VALUES ($1, $2)`,
      [id, req.user.id]
    );

    await query(
      `UPDATE study_resources SET completed_count = completed_count + 1 WHERE id = $1`,
      [id]
    );

    const result = await awardXp(req.user.id, 10, 'Resource completed', 'resource', id);

    res.json({ message: 'Resource completed', xp: result });
  } catch (err) {
    logger.error({ err }, 'completeStudyResource error');
    res.status(500).json({ error: 'Failed to complete resource' });
  }
}

async function getResourceStats(req, res) {
  try {
    const { rows: [stats] } = await query(
      `SELECT
         COUNT(*)::int as total_resources,
         COUNT(*) FILTER (WHERE type = 'note')::int as notes_count,
         COUNT(*) FILTER (WHERE type = 'video')::int as videos_count,
         COUNT(*) FILTER (WHERE type = 'practice')::int as practice_count,
         COALESCE(SUM(completed_count), 0)::int as total_completions
       FROM study_resources`
    );

    const { rows: [myStats] } = await query(
      `SELECT COUNT(*)::int as completed_by_me FROM resource_completions WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({ ...stats, ...myStats });
  } catch (err) {
    logger.error({ err }, 'getResourceStats error');
    res.status(500).json({ error: 'Failed to get resource stats' });
  }
}

async function startMockInterview(req, res) {
  try {
    const { difficulty = 'medium' } = req.body;

    const { rows: mcqQuestions } = await query(
      `SELECT id, text, options, genre, difficulty, marks, explanation
       FROM questions
       WHERE difficulty = $1 OR $1 = 'medium'
       ORDER BY RANDOM() LIMIT 10`,
      [difficulty]
    );

    const { rows: codingProblems } = await query(
      `SELECT id, title, description, input_format, output_format, constraints,
              sample_input, sample_output, difficulty, marks
       FROM coding_problems
       WHERE difficulty = $1 OR $1 = 'medium'
       ORDER BY RANDOM() LIMIT 2`,
      [difficulty]
    );

    const maxMcqScore = mcqQuestions.reduce((s, q) => s + (q.marks || 2), 0);
    const maxCodingScore = codingProblems.reduce((s, p) => s + (p.marks || 10), 0);
    const maxScore = maxMcqScore + maxCodingScore;

    const { rows: [session] } = await query(
      `INSERT INTO mock_interview_sessions (user_id, difficulty, max_score)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, difficulty, maxScore]
    );

    for (const q of mcqQuestions) {
      await query(
        `INSERT INTO mock_interview_answers (session_id, question_id, type, question_data, max_marks)
         VALUES ($1, $2, 'mcq', $3::jsonb, $4)`,
        [session.id, q.id, JSON.stringify(q), q.marks || 2]
      );
    }

    for (const p of codingProblems) {
      await query(
        `INSERT INTO mock_interview_answers (session_id, question_id, type, question_data, max_marks)
         VALUES ($1, $2, 'coding', $3::jsonb, $4)`,
        [session.id, p.id, JSON.stringify(p), p.marks || 10]
      );
    }

    res.json({
      session: {
        id: session.id,
        difficulty: session.difficulty,
        maxScore: session.max_score,
        mcqQuestions,
        codingProblems,
      },
    });
  } catch (err) {
    logger.error({ err }, 'startMockInterview error');
    res.status(500).json({ error: 'Failed to start mock interview' });
  }
}

async function submitMockInterviewAnswer(req, res) {
  try {
    const { sessionId, answerId, answer } = req.body;

    const { rows: [ans] } = await query(
      `SELECT * FROM mock_interview_answers WHERE id = $1 AND session_id = $2`,
      [answerId, sessionId]
    );
    if (!ans) return res.status(404).json({ error: 'Answer not found' });

    let correct = false;
    let marks = 0;

    if (ans.type === 'mcq') {
      const qData = typeof ans.question_data === 'string' ? JSON.parse(ans.question_data) : ans.question_data;
      const correctAnswer = typeof qData.correct_answer === 'string'
        ? JSON.parse(qData.correct_answer) : qData.correct_answer;
      correct = JSON.stringify(answer) === JSON.stringify(correctAnswer);
      marks = correct ? ans.max_marks : 0;
    } else {
      correct = true;
      marks = ans.max_marks;
    }

    await query(
      `UPDATE mock_interview_answers SET answer = $1, correct = $2, marks = $3 WHERE id = $4`,
      [JSON.stringify(answer), correct, marks, answerId]
    );

    res.json({ correct, marks, maxMarks: ans.max_marks });
  } catch (err) {
    logger.error({ err }, 'submitMockInterviewAnswer error');
    res.status(500).json({ error: 'Failed to submit answer' });
  }
}

async function completeMockInterview(req, res) {
  try {
    const { sessionId } = req.body;

    const { rows: answers } = await query(
      `SELECT * FROM mock_interview_answers WHERE session_id = $1`,
      [sessionId]
    );

    let mcqScore = 0;
    let codingScore = 0;
    let mcqTotal = 0;
    let codingTotal = 0;
    const mcqFeedback = [];
    const codingFeedback = [];

    for (const a of answers) {
      if (a.type === 'mcq') {
        mcqScore += a.marks;
        mcqTotal += a.max_marks;
        if (a.marks === 0 && a.answer) {
          mcqFeedback.push({ id: a.id, question: a.question_data });
        }
      } else {
        codingScore += a.marks;
        codingTotal += a.max_marks;
        if (!a.answer) {
          codingFeedback.push({ id: a.id, problem: a.question_data });
        }
      }
    }

    const totalScore = mcqScore + codingScore;
    const maxScore = mcqTotal + codingTotal;

    const sectionFeedback = [
      {
        section: 'MCQ',
        score: mcqScore,
        maxScore: mcqTotal,
        percentage: mcqTotal > 0 ? Math.round((mcqScore / mcqTotal) * 100) : 0,
        wrongCount: mcqFeedback.length,
        suggestions: mcqFeedback.length > 3
          ? ['Review fundamental concepts', 'Practice more aptitude questions', 'Focus on time management']
          : ['Good work! Keep practicing'],
      },
      {
        section: 'Coding',
        score: codingScore,
        maxScore: codingTotal,
        percentage: codingTotal > 0 ? Math.round((codingScore / codingTotal) * 100) : 0,
        skippedCount: codingFeedback.length,
        suggestions: codingFeedback.length > 0
          ? ['Practice data structures', 'Work on algorithm efficiency', 'Review coding patterns']
          : ['Great coding skills!'],
      },
    ];

    await query(
      `UPDATE mock_interview_sessions
       SET status = 'completed', mcq_score = $1, coding_score = $2, total_score = $3, section_feedback = $4::jsonb, completed_at = NOW()
       WHERE id = $5`,
      [mcqScore, codingScore, totalScore, JSON.stringify(sectionFeedback), sessionId]
    );

    const xpAward = Math.floor(totalScore * 2);
    const result = await awardXp(req.user.id, xpAward, 'Mock interview completed', 'mock_interview', sessionId);
    const newAchievements = await checkAndAwardAchievements(req.user.id);

    res.json({
      sessionId,
      mcqScore,
      codingScore,
      totalScore,
      maxScore,
      percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
      sectionFeedback,
      xpAwarded: xpAward,
      newAchievements,
    });
  } catch (err) {
    logger.error({ err }, 'completeMockInterview error');
    res.status(500).json({ error: 'Failed to complete interview' });
  }
}

async function startDailyChallengeCheck() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows: [existing] } = await query(
      `SELECT id FROM daily_challenges WHERE date = $1::date`,
      [today]
    );
    if (existing) return;

    const type = Math.random() > 0.5 ? 'mcq' : 'coding';
    let questionId = null;

    if (type === 'mcq') {
      const { rows } = await query(
        `SELECT id FROM questions ORDER BY RANDOM() LIMIT 1`
      );
      if (rows.length) questionId = rows[0].id;
    } else {
      const { rows } = await query(
        `SELECT id FROM coding_problems ORDER BY RANDOM() LIMIT 1`
      );
      if (rows.length) questionId = rows[0].id;
    }

    if (questionId) {
      await query(
        `INSERT INTO daily_challenges (date, question_id, type, xp_reward)
         VALUES ($1::date, $2, $3, 20) ON CONFLICT (date) DO NOTHING`,
        [today, questionId, type]
      );
      logger.info({ date: today, type, questionId }, 'Daily challenge created');
    }
  } catch (err) {
    logger.error({ err }, 'startDailyChallengeCheck error');
  }
}

module.exports = {
  awardXpHandler,
  getMyStats,
  getLeaderboard,
  getLevels,
  getAchievements,
  getAchievementWall,
  checkin,
  getStreak,
  getHeatmap,
  getDailyChallenge,
  submitDailyChallenge,
  listStudyResources,
  createStudyResource,
  updateStudyResource,
  deleteStudyResource,
  completeStudyResource,
  getResourceStats,
  startMockInterview,
  submitMockInterviewAnswer,
  completeMockInterview,
  awardXp,
  checkAndAwardAchievements,
  startDailyChallengeCheck,
};
