const { query } = require('../db');
const logger = require('./logger');
const { sendTestScheduledEmail, sendTestResultEmail, sendWeeklyDigestEmail, sendTestReminderEmail } = require('./email');
const { createNotification } = require('../controllers/notifications');

let intervalHandle = null;

// ── Start the scheduler ────────────────────────────────────
function startScheduler() {
  if (intervalHandle) return;
  logger.info('Starting notification scheduler...');

  // Check every 15 minutes
  intervalHandle = setInterval(runScheduledTasks, 15 * 60 * 1000);

  // Run immediately on startup
  runScheduledTasks();
}

function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// ── Auto-publish scheduled tests ──────────────────────────
async function publishScheduledTests() {
  try {
    const { rows } = await query(
      `UPDATE tests SET status='published', scheduled_publish_at=NULL
       WHERE status='draft' AND scheduled_publish_at IS NOT NULL AND scheduled_publish_at <= NOW()
       RETURNING id, title`
    );
    for (const test of rows) {
      logger.info({ testId: test.id, title: test.title }, 'Auto-published scheduled test');
    }
  } catch (err) {
    logger.error({ err }, 'publishScheduledTests error');
  }
}

// ── Main scheduler task ────────────────────────────────────
async function runScheduledTasks() {
  try {
    await publishScheduledTests();
    await sendDriveReminders();
    await sendResultAnnouncements();
    await sendTestStartReminders();
    await checkWeeklyDigest();
  } catch (err) {
    logger.error({ err }, 'Scheduler error');
  }
}

// ── Drive reminders ────────────────────────────────────────
async function sendDriveReminders() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { rows: upcomingDrives } = await query(`
    SELECT d.*, db.batch_id, b.name as batch_name
    FROM drives d
    JOIN drive_batches db ON db.drive_id = d.id
    JOIN batches b ON b.id = db.batch_id
    WHERE d.status = 'published'
      AND d.start_time BETWEEN $1 AND $2
  `, [now, in24h]);

  if (upcomingDrives.length === 0) return;

  const driveMap = {};
  for (const drive of upcomingDrives) {
    if (!driveMap[drive.id]) {
      driveMap[drive.id] = {
        id: drive.id,
        title: drive.title,
        description: drive.description,
        start_time: drive.start_time,
        end_time: drive.end_time,
        duration_minutes: drive.mcq_duration_minutes + drive.coding_duration_minutes,
        department: drive.department,
        batches: [],
      };
    }
    driveMap[drive.id].batches.push(drive.batch_name);
  }

  for (const drive of Object.values(driveMap)) {
    const { rows: students } = await query(`
      SELECT DISTINCT u.id, u.name, u.email
      FROM users u
      JOIN student_batches sb ON sb.user_id = u.id
      JOIN batches b ON b.id = sb.batch_id
      WHERE u.role = 'student'
        AND u.is_active = true
        AND b.name = ANY($1::text[])
    `, [drive.batches]);

    const { rows: [lastNotify] } = await query(`
      SELECT created_at FROM audit_log
      WHERE action = 'drive_reminder' AND entity_id = $1::uuid
      ORDER BY created_at DESC LIMIT 1
    `, [drive.id]);

    if (lastNotify) {
      const hoursSince = (now - new Date(lastNotify.created_at)) / (1000 * 60 * 60);
      if (hoursSince < 6) continue;
    }

    const testInfo = {
      title: drive.title,
      description: drive.description || `${drive.department} placement drive`,
      department: drive.department,
      start_time: drive.start_time,
      end_time: drive.end_time,
      duration_minutes: drive.duration_minutes || 180,
    };

    for (const student of students) {
      sendTestScheduledEmail({
        to: student.email,
        name: student.name,
        test: testInfo,
      }).catch(() => {});
    }

    await query(`
      INSERT INTO audit_log (action, entity_type, entity_id, metadata)
      VALUES ('drive_reminder', 'drive', $1, $2)
    `, [drive.id, JSON.stringify({ sent_to: students.length, batches: drive.batches })]);

    logger.info({ driveId: drive.id, students: students.length }, 'Drive reminder sent');
  }
}

// ── Result announcements ────────────────────────────────────
async function sendResultAnnouncements() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { rows: recentTests } = await query(`
    SELECT id, title, department
    FROM tests
    WHERE status = 'published'
      AND end_time BETWEEN $1 AND $2
      AND settings->>'autoNotifyResults' = 'true'
  `, [yesterday, now]);

  for (const test of recentTests) {
    const { rows: [existing] } = await query(`
      SELECT id FROM audit_log
      WHERE action = 'result_announcement' AND entity_id = $1::uuid
    `, [test.id]);
    if (existing) continue;

    const { rows: submissions } = await query(`
      SELECT s.score, s.max_score, s.submitted_at, u.id AS user_id, u.name, u.email
      FROM submissions s JOIN users u ON s.user_id = u.id
      WHERE s.test_id = $1 AND s.status = 'submitted'
    `, [test.id]);

    if (submissions.length === 0) continue;

    for (const sub of submissions) {
      sendTestResultEmail({
        to: sub.email,
        name: sub.name,
        result: {
          test_title: test.title,
          score: sub.score,
          total_marks: sub.max_score,
          submitted_at: sub.submitted_at,
        },
      }).catch(() => {});

      createNotification(sub.user_id, 'score_updated', `📊 Results: ${test.title}`, `Your score: ${sub.score}/${sub.max_score}`, {
        testId: test.id,
        score: sub.score,
        maxScore: sub.max_score,
      }).catch(() => {});
    }

    await query(`
      INSERT INTO audit_log (action, entity_type, entity_id, metadata)
      VALUES ('result_announcement', 'test', $1, $2)
    `, [test.id, JSON.stringify({ sent_to: submissions.length })]);

    logger.info({ testId: test.id, sent: submissions.length }, 'Result announcements sent');
  }
}

// ── Test start reminders (5 min before) ─────────────────────
async function sendTestStartReminders() {
  const now = new Date();
  const in5Min = new Date(now.getTime() + 5 * 60 * 1000);
  const in60Min = new Date(now.getTime() + 60 * 60 * 1000);
  const in24H = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Check for tests starting in ~5 minutes
  const { rows: imminentTests } = await query(`
    SELECT t.id, t.title, t.description, t.department, t.start_time, t.end_time, t.duration_minutes
    FROM tests t
    WHERE t.status = 'published'
      AND t.start_time BETWEEN $1 AND $2
  `, [now, in5Min]);

  for (const test of imminentTests) {
    const { rows: students } = await query(`
      SELECT DISTINCT u.id, u.name, u.email
      FROM users u
      JOIN test_invitations ti ON ti.user_id = u.id
      WHERE ti.test_id = $1 AND u.is_active = true
    `, [test.id]);

    for (const student of students) {
      createNotification(student.id, 'test_start_alert', `⏰ Test Starting Soon: ${test.title}`, `"${test.title}" starts in 5 minutes. Get ready!`, {
        testId: test.id,
        startTime: test.start_time,
      }).catch(() => {});
    }
  }

  // Check for tests starting in ~1 hour (email reminder)
  const { rows: hourTests } = await query(`
    SELECT t.id, t.title, t.description, t.department, t.start_time, t.end_time, t.duration_minutes
    FROM tests t
    WHERE t.status = 'published'
      AND t.start_time BETWEEN $3 AND $1
  `, [in60Min, now, in24H]);

  for (const test of hourTests) {
    const { rows: [lastNotify] } = await query(`
      SELECT created_at FROM audit_log
      WHERE action = 'test_1h_reminder' AND entity_id = $1::uuid
      ORDER BY created_at DESC LIMIT 1
    `, [test.id]);
    if (lastNotify) continue;

    const { rows: students } = await query(`
      SELECT DISTINCT u.id, u.name, u.email
      FROM users u
      JOIN test_invitations ti ON ti.user_id = u.id
      WHERE ti.test_id = $1 AND u.is_active = true
    `, [test.id]);

    for (const student of students) {
      sendTestReminderEmail({
        to: student.email,
        name: student.name,
        test: {
          title: test.title,
          description: test.description,
          department: test.department,
          start_time: test.start_time,
          end_time: test.end_time,
          duration_minutes: test.duration_minutes,
        },
      }).catch(() => {});

      createNotification(student.id, 'test_start_alert', `⏰ Test Reminder: ${test.title}`, `"${test.title}" starts in about 1 hour.`, {
        testId: test.id,
        startTime: test.start_time,
      }).catch(() => {});
    }

    await query(`
      INSERT INTO audit_log (action, entity_type, entity_id, metadata)
      VALUES ('test_1h_reminder', 'test', $1, $2)
    `, [test.id, JSON.stringify({ sent_to: students.length })]);
  }
}

// ── Weekly digest (Sunday 8 AM) ─────────────────────────────
async function checkWeeklyDigest() {
  const now = new Date();
  // Only run on Sunday between 8:00 and 8:15
  if (now.getDay() !== 0 || now.getHours() !== 8 || now.getMinutes() > 15) return;

  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Only run once per week
  const { rows: [lastRun] } = await query(`
    SELECT created_at FROM audit_log
    WHERE action = 'weekly_digest'
    ORDER BY created_at DESC LIMIT 1
  `);
  if (lastRun) {
    const daysSince = (now - new Date(lastRun.created_at)) / (1000 * 60 * 60 * 24);
    if (daysSince < 6) return;
  }

  const { rows: students } = await query(
    "SELECT id, name, email FROM users WHERE role = 'student' AND is_active = true"
  );

  let sent = 0;
  for (const student of students) {
    try {
      // Get last week's submissions
      const { rows: submissions } = await query(`
        SELECT s.score, s.max_score, t.title AS test_title, s.submitted_at
        FROM submissions s
        JOIN tests t ON t.id = s.test_id
        WHERE s.user_id = $1 AND s.submitted_at > $2 AND s.status IN ('submitted', 'auto_submitted')
        ORDER BY s.submitted_at DESC
      `, [student.id, lastWeek]);

      // Get upcoming tests
      const { rows: upcomingTests } = await query(`
        SELECT t.title, t.start_time
        FROM tests t
        JOIN test_invitations ti ON ti.test_id = t.id
        WHERE ti.user_id = $1 AND t.start_time > $2 AND t.start_time < $3 AND t.status = 'published'
        ORDER BY t.start_time ASC
      `, [student.id, now, nextWeek]);

      // Get unread notifications count
      const { rows: [unread] } = await query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
        [student.id]
      );

      // Get achievements earned this week
      const { rows: achievements } = await query(`
        SELECT ad.name, ad.icon_url, sa.earned_at
        FROM student_achievements sa
        JOIN achievement_definitions ad ON ad.id = sa.achievement_id
        WHERE sa.user_id = $1 AND sa.earned_at > $2
      `, [student.id, lastWeek]);

      await sendWeeklyDigestEmail({
        to: student.email,
        name: student.name,
        submissions,
        upcomingTests,
        unreadCount: unread.count,
        achievements,
      }).catch(() => {});
      sent++;
    } catch {
      // skip individual errors
    }
  }

  await query(`
    INSERT INTO audit_log (action, entity_type, metadata)
    VALUES ('weekly_digest', 'system', $1)
  `, [JSON.stringify({ sent })]);

  logger.info({ sent }, 'Weekly digest sent');
}

module.exports = { startScheduler, stopScheduler };
