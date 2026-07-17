const bcrypt = require('bcryptjs');
const { query }  = require('../db');
const { cacheDel } = require('../db/redis');
const {
  sendAdminCreatedEmail,
  sendBulkImportEmail,
  sendTestScheduledEmail,
  sendTestResultEmail,
} = require('../services/email');

// ── GET /api/users ────────────────────────────────────────────
async function listUsers(req, res) {
  const { role, search, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  let where = 'WHERE 1=1';

  if (role)   { params.push(role);           where += ` AND role=$${params.length}`; }
  if (search) { params.push(`%${search}%`);  where += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length})`; }

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT id, name, email, role, branch, roll_number, is_active, avatar_url, last_login, created_at
     FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  );

  const { rows: [{ count }] } = await query(`SELECT COUNT(*) FROM users ${where}`, params.slice(0, -2));
  res.json({ users: rows, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
}

// ── GET /api/users/stats ──────────────────────────────────────
async function getStats(req, res) {
  const { rows: [stats] } = await query(`
    SELECT
      COUNT(*)                                        AS total,
      COUNT(*) FILTER (WHERE role = 'student')        AS students,
      COUNT(*) FILTER (WHERE role = 'admin')          AS admins,
      COUNT(*) FILTER (WHERE is_active = true)        AS active,
      COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '7 days') AS active_this_week
    FROM users
  `);

  // Genre-wise performance (last 30 days)
  const { rows: genreStats } = await query(`
    SELECT q.genre,
      COUNT(DISTINCT q.id) as total_questions,
      AVG(CASE WHEN s.answers->>q.id::text IS NOT NULL AND s.answers->>q.id::text != '' THEN 1 ELSE 0 END) as attempt_rate,
      AVG(CASE
        WHEN s.answers->>q.id::text IS NOT NULL
          AND (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}')
        THEN 1.0 ELSE 0.0
      END) as accuracy
    FROM submissions s
    JOIN tests t ON s.test_id = t.id
    JOIN sections sec ON sec.test_id = t.id
    JOIN questions q ON q.section_id = sec.id AND q.genre IS NOT NULL
    WHERE s.status = 'submitted'
      AND s.submitted_at > NOW() - INTERVAL '30 days'
    GROUP BY q.genre
    ORDER BY q.genre
  `);

  // Difficulty-wise performance
  const { rows: diffStats } = await query(`
    SELECT q.difficulty,
      COUNT(DISTINCT q.id) as total_questions,
      AVG(CASE
        WHEN s.answers->>q.id::text IS NOT NULL
          AND (s.answers->>q.id::text)::text = (q.correct_answer#>>'{}')
        THEN 1.0 ELSE 0.0
      END) as accuracy
    FROM submissions s
    JOIN tests t ON s.test_id = t.id
    JOIN sections sec ON sec.test_id = t.id
    JOIN questions q ON q.section_id = sec.id
    WHERE s.status = 'submitted'
      AND s.submitted_at > NOW() - INTERVAL '30 days'
    GROUP BY q.difficulty
    ORDER BY q.difficulty
  `);

  // Coding problem performance (easy vs hard)
  const { rows: codingStats } = await query(`
    SELECT cp.difficulty,
      COUNT(DISTINCT cp.id) as total_problems,
      AVG(
        CASE WHEN s.code_results ? cp.id::text
          THEN ((s.code_results -> cp.id::text ->> 'earned')::numeric / NULLIF((s.code_results -> cp.id::text ->> 'total')::numeric, 0))
          ELSE NULL
        END
      ) as avg_score_rate
    FROM submissions s
    JOIN tests t ON s.test_id = t.id
    JOIN sections sec ON sec.test_id = t.id
    JOIN coding_problems cp ON cp.section_id = sec.id
    WHERE s.status = 'submitted'
      AND s.submitted_at > NOW() - INTERVAL '30 days'
    GROUP BY cp.difficulty
    ORDER BY cp.difficulty
  `);

  // Recent submissions with scores for dashboard
  const { rows: recentSubmissions } = await query(`
    SELECT s.id, s.score, s.max_score, s.submitted_at, s.status,
      u.name as user_name, t.title as test_title
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    JOIN tests t ON s.test_id = t.id
    WHERE s.status = 'submitted'
    ORDER BY s.submitted_at DESC NULLS LAST
    LIMIT 10
  `);

  res.json({ ...stats, genreStats, diffStats, codingStats, recentSubmissions });
}

// ── POST /api/users/admin ─────────────────────────────────────
async function createAdmin(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = await query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
  if (existing.rows.length) return res.status(400).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 12);
  const { rows: [user] } = await query(
    `INSERT INTO users (name, email, password_hash, role, created_by)
     VALUES ($1,$2,$3,'admin',$4) RETURNING id, name, email, role, created_at`,
    [name, email.toLowerCase(), hash, req.user.id]
  );

  // Email the new admin their credentials
  sendAdminCreatedEmail({ to: email.toLowerCase(), name, tempPassword: password }).catch(() => {});

  res.status(201).json({ user });
}

// ── POST /api/users/bulk-import ───────────────────────────────
async function bulkImport(req, res) {
  const { students } = req.body;
  if (!Array.isArray(students) || !students.length) return res.status(400).json({ error: 'Student list required' });

  const results = { created: 0, skipped: 0, errors: [] };

  for (const s of students) {
    if (!s.email) { results.errors.push(`Missing email for ${s.name}`); continue; }
    try {
      const tempPass = Math.random().toString(36).slice(2, 10);
      const hash     = await bcrypt.hash(tempPass, 10);
      const result   = await query(
        `INSERT INTO users (name, email, password_hash, role, branch, roll_number)
         VALUES ($1,$2,$3,'student',$4,$5)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [s.name, s.email.toLowerCase(), hash, s.branch, s.rollNumber]
      );

      if (result.rows.length) {
        results.created++;
        // Email each student their credentials
        sendBulkImportEmail({ to: s.email.toLowerCase(), name: s.name, tempPassword: tempPass }).catch(() => {});
      } else {
        results.skipped++;
      }
    } catch (err) {
      results.errors.push(`${s.email}: ${err.message}`);
    }
  }

  res.json(results);
}

// ── PATCH /api/users/:id ──────────────────────────────────────
async function updateUser(req, res) {
  const { id } = req.params;
  const { name, role, is_active, branch, roll_number } = req.body;

  const fields = [];
  const params = [];

  if (name       !== undefined) { params.push(name);       fields.push(`name=$${params.length}`); }
  if (role       !== undefined) { params.push(role);       fields.push(`role=$${params.length}`); }
  if (is_active  !== undefined) { params.push(is_active);  fields.push(`is_active=$${params.length}`); }
  if (branch     !== undefined) { params.push(branch);     fields.push(`branch=$${params.length}`); }
  if (roll_number !== undefined){ params.push(roll_number);fields.push(`roll_number=$${params.length}`); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(id);
  const { rows: [user] } = await query(
    `UPDATE users SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${params.length} RETURNING id, name, email, role, is_active`,
    params
  );

  if (!user) return res.status(404).json({ error: 'User not found' });
  await cacheDel(`user:${id}`);
  res.json({ user });
}

// ── DELETE /api/users/:id ─────────────────────────────────────
async function deleteUser(req, res) {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });

  const { rows } = await query('DELETE FROM users WHERE id=$1 RETURNING id', [id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });

  await cacheDel(`user:${id}`);
  res.json({ message: 'User deleted' });
}

// ── GET /api/admins ───────────────────────────────────────────
async function listAdmins(req, res) {
  const { rows } = await query(
    `SELECT id, name, email, role, is_active, created_at, last_login
     FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at DESC`
  );
  res.json({ admins: rows });
}

// ── POST /api/users/notify-test ───────────────────────────────
// Send test scheduled email to all students in a department
async function notifyTestScheduled(req, res) {
  const { test_id } = req.body;
  if (!test_id) return res.status(400).json({ error: 'test_id required' });

  const { rows: [test] } = await query('SELECT * FROM tests WHERE id=$1', [test_id]);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  const { rows: students } = await query(
    `SELECT name, email FROM users
     WHERE role='student' AND is_active=true
     AND (department=$1 OR $1='All Departments')`,
    [test.department]
  );

  let sent = 0;
  for (const s of students) {
    sendTestScheduledEmail({ to: s.email, name: s.name, test }).catch(() => {});
    sent++;
  }

  res.json({ message: `Notifications queued for ${sent} students.`, sent });
}


// ── POST /api/users/send-results ─────────────────────────────
// Email each student their individual test result
async function sendResults(req, res) {
  const { test_id } = req.body;
  if (!test_id) return res.status(400).json({ error: 'test_id required' });

  const { rows: [test] } = await query('SELECT * FROM tests WHERE id=$1', [test_id]);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  // Get all submitted submissions with student info
  const { rows: submissions } = await query(`
    SELECT s.id, s.score, s.max_score, s.submitted_at, s.time_taken_seconds,
           u.name, u.email
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    WHERE s.test_id=$1 AND s.status='submitted'
  `, [test_id]);

  if (!submissions.length) {
    return res.status(400).json({ error: 'No submitted results found for this test' });
  }

  let sent = 0;
  for (const sub of submissions) {
    sendTestResultEmail({
      to:   sub.email,
      name: sub.name,
      result: {
        test_title:   test.title,
        score:        sub.score,
        total_marks:  sub.max_score,
        submitted_at: sub.submitted_at,
      },
    }).catch(() => {});
    sent++;
  }

  res.json({ message: `Results queued for ${sent} student${sent !== 1 ? 's' : ''}.`, sent });
}

module.exports = {
  listUsers,
  getStats,
  createAdmin,
  bulkImport,
  updateUser,
  deleteUser,
  listAdmins,
  notifyTestScheduled,
  sendResults,
};
