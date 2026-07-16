const { query } = require('../db');
const { sendEmail, wrap } = require('../services/email');

// ── POST /api/email/send ──────────────────────────────────────
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
  ).catch(() => {});

  res.json({ sent, errors, total: unique.length });
}

module.exports = { sendBulkEmail };
