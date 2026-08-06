const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { query }        = require('../db');
const { cacheSet, cacheDel, cacheGet } = require('../db/redis');
const { normalizeDepartment, ALLOWED_DEPARTMENTS } = require('../config/departments');
const {
  sendWelcomeEmail,
  sendPasswordResetEmail,
} = require('../services/email');

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

function signToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url,
    department: user.department || null,
    branch: user.branch || null,
    roll_number: user.roll_number || null,
    batch: user.batch || null,
    year_of_study: user.year_of_study || null,
    profileComplete: isStudentProfileComplete(user),
  };
}

function isStudentProfileComplete(user) {
  if (!user) return false;
  if (user.role && user.role !== 'student') return true;
  return Boolean(
    user.roll_number &&
    String(user.roll_number).trim() &&
    user.batch &&
    String(user.batch).trim() &&
    user.year_of_study
  );
}

async function assignUserToCluster({ userId, rollNumber, batchName, department, yearOfStudy }) {
  const year = parseInt(yearOfStudy, 10) || 1;
  const dept = department || null;
  const batch = batchName.trim();
  const roll = rollNumber.trim();

  await query(
    `UPDATE users SET
       roll_number = $1,
       batch = $2,
       year_of_study = $3,
       department = COALESCE($4, department),
       branch = COALESCE(branch, $4)
     WHERE id = $5`,
    [roll, batch, year, dept, userId]
  );

  // Ensure a batches row exists so the student lands in the same cluster
  // admins use for test/drive mapping.
  if (dept) {
    const { rows: [batchRow] } = await query(
      `INSERT INTO batches (name, department, year_of_study)
       VALUES ($1, $2, $3)
       ON CONFLICT (name, department) DO UPDATE SET
         year_of_study = COALESCE(EXCLUDED.year_of_study, batches.year_of_study)
       RETURNING id`,
      [batch, dept, year]
    );

    if (batchRow?.id) {
      const semester = process.env.CURRENT_SEMESTER || `${new Date().getFullYear()}-Spring`;
      await query(
        `INSERT INTO student_batches (user_id, batch_id, year_of_study, semester)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, semester) DO UPDATE SET
           batch_id = EXCLUDED.batch_id,
           year_of_study = EXCLUDED.year_of_study`,
        [userId, batchRow.id, year, semester]
      );
    }
  }

  await cacheDel(`user:${userId}`);

  const { rows: [user] } = await query(
    `SELECT id, name, email, role, avatar_url, department, branch, roll_number, batch, year_of_study, is_active
     FROM users WHERE id = $1`,
    [userId]
  );
  return user;
}

// ── POST /api/auth/login ──────────────────────────────────────
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { rows } = await query(
    `SELECT id, name, email, role, password_hash, is_active, avatar_url,
            department, branch, roll_number, batch, year_of_study
     FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  const user = rows[0];
  if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const token = signToken(user.id, user.role);
  res.json({ token, user: publicUser(user) });
}

// ── POST /api/auth/register ───────────────────────────────────
async function register(req, res) {
  const { name, email, password, department, rollNumber, branch, batch, yearOfStudy } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const emailLower = email.toLowerCase().trim();
  const existing   = await query('SELECT id FROM users WHERE email = $1', [emailLower]);
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const allowedDept = normalizeDepartment(department);
  if (department && !allowedDept) {
    return res.status(400).json({
      error: `This platform is only for ${ALLOWED_DEPARTMENTS.join(' and ')} students.`,
    });
  }

  const hash = await bcrypt.hash(password, 12);
  const { rows: [created] } = await query(
    `INSERT INTO users (name, email, password_hash, role, department, roll_number, branch, batch, year_of_study, is_active)
     VALUES ($1,$2,$3,'student',$4,$5,$6,$7,$8,$9)
     RETURNING id, name, email, role, department, avatar_url, roll_number, branch, batch, year_of_study`,
    [name.trim(), emailLower, hash, allowedDept || null, rollNumber || null, branch || allowedDept || null, batch || null, yearOfStudy || 1, true]
  );

  let user = created;
  if (rollNumber && batch && allowedDept) {
    user = await assignUserToCluster({
      userId: created.id,
      rollNumber,
      batchName: batch,
      department: allowedDept,
      yearOfStudy: yearOfStudy || 1,
    });
  }

  const token = signToken(user.id, user.role);

  // Send welcome email (non-blocking)
  sendWelcomeEmail({ to: emailLower, name: name.trim() }).catch(() => {});

  res.status(201).json({
    token,
    user: publicUser(user),
  });
}

// ── POST /api/auth/google ─────────────────────────────────────
async function googleLogin(req, res) {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential required' });
  if (!googleClient) return res.status(400).json({ error: 'Google OAuth is not configured' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken:  credential,
      audience: googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const { sub: googleId, email, name, picture } = payload;

  const isNew = !(await query('SELECT id FROM users WHERE google_id=$1', [googleId])).rows.length;

  const { rows: [user] } = await query(`
    INSERT INTO users (google_id, email, name, avatar_url, role)
    VALUES ($1,$2,$3,$4,'student')
    ON CONFLICT (google_id) DO UPDATE SET
      email = EXCLUDED.email, name = EXCLUDED.name,
      avatar_url = EXCLUDED.avatar_url, last_login = NOW()
    RETURNING id, name, email, role, avatar_url, is_active,
              department, branch, roll_number, batch, year_of_study
  `, [googleId, email.toLowerCase(), name, picture]);

  if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated' });

  // Send welcome email only on first login
  if (isNew) sendWelcomeEmail({ to: email.toLowerCase(), name }).catch(() => {});

  const token = signToken(user.id, user.role);
  res.json({
    token,
    user: publicUser(user),
    needsProfileCompletion: !isStudentProfileComplete(user),
  });
}

// ── POST /api/auth/complete-profile ───────────────────────────
// Required after Google sign-in (and for any student missing cluster fields).
async function completeProfile(req, res) {
  const { rollNumber, batch, yearOfStudy, department } = req.body;
  if (!rollNumber || !batch || !yearOfStudy) {
    return res.status(400).json({
      error: 'Enrollment number, class/batch, and year of study are required',
    });
  }
  if (req.user.role !== 'student') {
    return res.status(400).json({ error: 'Only students complete this profile step' });
  }

  const year = parseInt(yearOfStudy, 10);
  if (![1, 2, 3, 4].includes(year)) {
    return res.status(400).json({ error: 'Year of study must be 1–4' });
  }

  const requestedDept = department ? String(department).trim() : (req.user.department || null);
  const allowedDept = requestedDept ? normalizeDepartment(requestedDept) : req.user.department || null;
  if (requestedDept && !allowedDept) {
    return res.status(400).json({
      error: `This platform is only for ${ALLOWED_DEPARTMENTS.join(' and ')} students.`,
    });
  }

  const user = await assignUserToCluster({
    userId: req.user.id,
    rollNumber: String(rollNumber),
    batchName: String(batch),
    department: allowedDept,
    yearOfStudy: year,
  });

  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({ user: publicUser(user), message: 'Profile completed' });
}

// ── POST /api/auth/logout ─────────────────────────────────────
async function logout(req, res) {
  await cacheDel(`user:${req.user.id}`);
  res.json({ message: 'Logged out successfully' });
}

// ── GET /api/auth/me ──────────────────────────────────────────
async function getMe(req, res) {
  res.json({
    user: publicUser(req.user),
    needsProfileCompletion: req.user.role === 'student' && !isStudentProfileComplete(req.user),
  });
}

// ── POST /api/auth/change-password ────────────────────────────
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]?.password_hash) return res.status(400).json({ error: 'Cannot change password for Google accounts' });

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
  await cacheDel(`user:${req.user.id}`);

  res.json({ message: 'Password changed successfully' });
}

// ── POST /api/auth/forgot-password ───────────────────────────
// Generates a 6-digit OTP, caches it in Redis for 15 min, sends email
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const { rows } = await query(
    'SELECT id, name, email, password_hash FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  // Always return success to prevent email enumeration
  if (!rows.length || !rows[0].password_hash) {
    return res.json({ message: 'If that email exists, an OTP has been sent.' });
  }

  const user = rows[0];
  const otp  = crypto.randomInt(100000, 999999).toString(); // 6-digit OTP

  // Store OTP in Redis for 15 minutes
  await cacheSet(`otp:${user.id}`, otp, 900);

  await sendPasswordResetEmail({ to: user.email, name: user.name, otp });

  res.json({ message: 'If that email exists, an OTP has been sent.' });
}

// ── POST /api/auth/reset-password ────────────────────────────
// Verifies OTP and sets new password
async function resetPassword(req, res) {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, OTP and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const { rows } = await query(
    'SELECT id, name FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  if (!rows.length) return res.status(400).json({ error: 'Invalid OTP or email' });

  const user       = rows[0];
  const cachedOtp  = await cacheGet(`otp:${user.id}`);

  if (!cachedOtp || cachedOtp !== otp) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);

  // Delete OTP so it can't be reused
  await cacheDel(`otp:${user.id}`);
  await cacheDel(`user:${user.id}`);

  res.json({ message: 'Password reset successfully. Please log in.' });
}

module.exports = {
  login,
  register,
  googleLogin,
  completeProfile,
  logout,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  isStudentProfileComplete,
};
