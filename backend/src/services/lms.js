const axios = require('axios');
const { query } = require('../db');
const logger = require('./logger');

function getLMSConfig() {
  return {
    type: process.env.LMS_TYPE || 'moodle',
    baseUrl: process.env.LMS_BASE_URL,
    apiKey: process.env.LMS_API_KEY,
    apiSecret: process.env.LMS_API_SECRET,
  };
}

async function syncRoster(req, res) {
  try {
    const config = getLMSConfig();
    const { csvData, courseId } = req.body;
    let students = [];
    if (csvData) {
      const lines = csvData.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim());
        const entry = {};
        headers.forEach((h, idx) => { entry[h] = vals[idx] || ''; });
        students.push(entry);
      }
    } else if (config.type === 'moodle' && config.baseUrl && config.apiKey) {
      const resp = await axios.get(`${config.baseUrl}/webservice/rest/server.php`, {
        params: {
          wstoken: config.apiKey,
          wsfunction: 'core_enrol_get_enrolled_users',
          courseid: courseId,
          moodlewsrestformat: 'json',
        },
      });
      students = (resp.data || []).map(u => ({
        email: u.email,
        name: `${u.firstname} ${u.lastname}`,
        department: u.department || '',
        roll_number: u.idnumber || '',
      }));
    } else if (config.type === 'canvas' && config.baseUrl && config.apiKey) {
      const resp = await axios.get(`${config.baseUrl}/api/v1/courses/${courseId}/enrollments`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      students = (resp.data || []).filter(e => e.type === 'StudentEnrollment').map(e => ({
        email: e.user?.login_id || e.user?.email || '',
        name: e.user?.sortable_name || e.user?.name || '',
        roll_number: e.user?.sis_user_id || '',
      }));
    } else if (config.type === 'blackboard' && config.baseUrl && config.apiKey) {
      const resp = await axios.get(`${config.baseUrl}/learn/api/public/v1/courses/${courseId}/users`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      students = (resp.data?.results || []).filter(u => u.user?.userName).map(u => ({
        email: u.user?.userName || '',
        name: `${u.user?.name?.given} ${u.user?.name?.family}`,
        roll_number: u.user?.studentId || '',
      }));
    }
    let imported = 0;
    for (const s of students) {
      if (!s.email) continue;
      await query(
        `INSERT INTO users (name, email, role, department, roll_number)
         VALUES ($1, $2, 'student', $3, $4)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, department = EXCLUDED.department, roll_number = EXCLUDED.roll_number`,
        [s.name || s.email.split('@')[0], s.email.toLowerCase().trim(), s.department || null, s.roll_number || null]
      ).catch(() => {});
      imported++;
    }
    await query(
      `INSERT INTO lms_sync_logs (type, status, details) VALUES ('roster', 'success', $1)`,
      [JSON.stringify({ imported, total: students.length, courseId })]
    );
    logger.info({ imported, total: students.length }, 'LMS roster sync completed');
    res.json({ message: 'Roster synced', imported, total: students.length });
  } catch (err) {
    logger.error({ err }, 'LMS roster sync failed');
    await query(
      `INSERT INTO lms_sync_logs (type, status, details) VALUES ('roster', 'failed', $1)`,
      [JSON.stringify({ error: err.message })]
    );
    res.status(500).json({ error: 'Roster sync failed: ' + err.message });
  }
}

async function syncScores(req, res) {
  try {
    const config = getLMSConfig();
    const { testId } = req.body;
    const { rows: submissions } = await query(
      `SELECT s.score, s.max_score, u.email, u.name, u.roll_number
       FROM submissions s JOIN users u ON s.user_id = u.id
       WHERE s.test_id = $1 AND s.status = 'submitted'`,
      [testId]
    );
    let pushed = 0;
    for (const sub of submissions) {
      if (config.type === 'moodle' && config.baseUrl && config.apiKey) {
        await axios.post(`${config.baseUrl}/webservice/rest/server.php`, null, {
          params: {
            wstoken: config.apiKey,
            wsfunction: 'core_grades_update_grades',
            courseid: req.body.courseId,
            component: 'mod_assign',
            itemname: `Test ${testId}`,
            'userid[0]': sub.email,
            'grade[0]': sub.max_score > 0 ? ((sub.score / sub.max_score) * 100) : 0,
          },
        }).catch(() => {});
      } else if (config.baseUrl) {
        await axios.post(`${config.baseUrl}/api/scores`, {
          student_email: sub.email,
          score: sub.score,
          max_score: sub.max_score,
          test_id: testId,
        }, { headers: { Authorization: `Bearer ${config.apiKey}` } }).catch(() => {});
      }
      pushed++;
    }
    await query(
      `INSERT INTO lms_sync_logs (type, status, details) VALUES ('scores', 'success', $1)`,
      [JSON.stringify({ pushed, total: submissions.length, testId })]
    );
    logger.info({ pushed, testId }, 'LMS scores sync completed');
    res.json({ message: 'Scores synced', pushed, total: submissions.length });
  } catch (err) {
    logger.error({ err }, 'LMS scores sync failed');
    await query(
      `INSERT INTO lms_sync_logs (type, status, details) VALUES ('scores', 'failed', $1)`,
      [JSON.stringify({ error: err.message })]
    );
    res.status(500).json({ error: 'Score sync failed: ' + err.message });
  }
}

async function listCourses(req, res) {
  try {
    const config = getLMSConfig();
    let courses = [];
    if (config.type === 'moodle' && config.baseUrl && config.apiKey) {
      const resp = await axios.get(`${config.baseUrl}/webservice/rest/server.php`, {
        params: { wstoken: config.apiKey, wsfunction: 'core_course_get_courses', moodlewsrestformat: 'json' },
      });
      courses = (resp.data || []).map(c => ({ id: c.id, name: c.fullname, shortName: c.shortname }));
    } else if (config.type === 'canvas' && config.baseUrl && config.apiKey) {
      const resp = await axios.get(`${config.baseUrl}/api/v1/courses`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      courses = (resp.data || []).map(c => ({ id: c.id, name: c.name, code: c.course_code }));
    } else if (config.type === 'blackboard' && config.baseUrl && config.apiKey) {
      const resp = await axios.get(`${config.baseUrl}/learn/api/public/v1/courses`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      courses = (resp.data?.results || []).map(c => ({ id: c.id, name: c.name, code: c.courseId }));
    }
    res.json({ courses });
  } catch (err) {
    logger.error({ err }, 'LMS list courses failed');
    res.status(500).json({ error: 'Failed to list courses: ' + err.message });
  }
}

async function getSyncLogs(req, res) {
  const { rows } = await query('SELECT * FROM lms_sync_logs ORDER BY created_at DESC LIMIT 50');
  res.json({ logs: rows });
}

async function testConnection(req, res) {
  try {
    const config = getLMSConfig();
    if (!config.baseUrl) return res.json({ connected: false, message: 'LMS_BASE_URL not configured' });
    let connected = false;
    if (config.type === 'moodle') {
      const resp = await axios.get(`${config.baseUrl}/webservice/rest/server.php`, {
        params: { wstoken: config.apiKey, wsfunction: 'core_webservice_get_site_info', moodlewsrestformat: 'json' },
        timeout: 10000,
      });
      connected = resp.data?.sitename ? true : false;
    } else if (config.type === 'canvas') {
      const resp = await axios.get(`${config.baseUrl}/api/v1/accounts`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        timeout: 10000,
      });
      connected = Array.isArray(resp.data);
    } else {
      const resp = await axios.get(config.baseUrl, { timeout: 10000 });
      connected = resp.status === 200;
    }
    res.json({ connected, message: connected ? 'Connected successfully' : 'Connection failed' });
  } catch (err) {
    res.json({ connected: false, message: err.message });
  }
}

module.exports = { syncRoster, syncScores, listCourses, getSyncLogs, testConnection };
