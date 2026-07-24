const { query } = require('../db');
const { sendSMS, sendTestReminderSMS } = require('../services/sms');

// ── POST /api/sms/send (admin) ─────────────────────────────
async function sendBulkSMS(req, res) {
  const { message, targetRole, targetUserIds } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  let users = [];

  if (targetUserIds && targetUserIds.length > 0) {
    const { rows } = await query(
      'SELECT id, name, phone FROM users WHERE id = ANY($1) AND phone IS NOT NULL AND sms_opt_in = true',
      [targetUserIds]
    );
    users = rows;
  } else if (targetRole) {
    const { rows } = await query(
      'SELECT id, name, phone FROM users WHERE role = $1 AND phone IS NOT NULL AND sms_opt_in = true AND is_active = true',
      [targetRole]
    );
    users = rows;
  } else {
    const { rows } = await query(
      "SELECT id, name, phone FROM users WHERE phone IS NOT NULL AND sms_opt_in = true AND is_active = true AND role = 'student'"
    );
    users = rows;
  }

  if (users.length === 0) {
    return res.status(400).json({ error: 'No opted-in recipients with phone numbers found' });
  }

  let sent = 0;
  let errors = 0;

  for (const user of users) {
    try {
      await sendSMS(user.phone, message);
      sent++;
    } catch {
      errors++;
    }
  }

  res.json({ sent, errors, total: users.length });
}

// ── POST /api/sms/test-reminder/:testId (admin) ────────────
async function sendSMSTestReminder(req, res) {
  const { testId } = req.params;

  const { rows: [test] } = await query(`
    SELECT t.*, array_agg(DISTINCT b.name) as batch_names
    FROM tests t
    LEFT JOIN test_batches tb ON tb.test_id = t.id
    LEFT JOIN batches b ON b.id = tb.batch_id
    WHERE t.id = $1
    GROUP BY t.id
  `, [testId]);

  if (!test) {
    return res.status(404).json({ error: 'Test not found' });
  }

  const { rows: students } = await query(`
    SELECT DISTINCT u.id, u.name, u.phone
    FROM users u
    JOIN test_invitations ti ON ti.user_id = u.id
    WHERE ti.test_id = $1 AND u.is_active = true AND u.phone IS NOT NULL AND u.sms_opt_in = true
  `, [testId]);

  if (students.length === 0) {
    return res.status(400).json({ error: 'No opted-in students with phone numbers found' });
  }

  let sent = 0;
  let errors = 0;

  for (const student of students) {
    try {
      await sendTestReminderSMS({
        to: student.phone,
        name: student.name,
        test: {
          title: test.title,
          description: test.description,
          start_time: test.start_time,
          end_time: test.end_time,
          duration_minutes: test.duration_minutes,
        },
      });
      sent++;
    } catch {
      errors++;
    }
  }

  res.json({ sent, errors, total: students.length });
}

module.exports = { sendBulkSMS, sendSMSTestReminder };
