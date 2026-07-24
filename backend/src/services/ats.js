const axios = require('axios');
const { query } = require('../db');
const logger = require('./logger');

function getATSConfig() {
  return {
    type: process.env.ATS_TYPE || 'greenhouse',
    apiKey: process.env.ATS_API_KEY,
    apiSecret: process.env.ATS_API_SECRET,
    companyId: process.env.ATS_COMPANY_ID,
  };
}

async function pushCandidate(req, res) {
  try {
    const config = getATSConfig();
    const { studentIds, jobId } = req.body;
    if (!studentIds || !studentIds.length) return res.status(400).json({ error: 'No students selected' });
    const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: students } = await query(
      `SELECT id, name, email, phone, roll_number, department, branch, batch
       FROM users WHERE id IN (${placeholders})`,
      studentIds
    );
    let pushed = 0;
    let errors = [];
    for (const student of students) {
      try {
        if (config.type === 'greenhouse') {
          await axios.post('https://harvest.greenhouse.io/v1/candidates', {
            first_name: (student.name || '').split(' ')[0] || student.name,
            last_name: (student.name || '').split(' ').slice(1).join(' ') || '',
            email: student.email,
            phone: student.phone,
            company_id: config.companyId,
          }, {
            auth: { username: config.apiKey, password: '' },
          });
        } else if (config.type === 'lever') {
          await axios.post('https://api.lever.co/v1/candidates', {
            name: student.name,
            email: student.email,
            phone: student.phone,
            tags: [student.department, student.branch].filter(Boolean),
            links: [],
          }, {
            auth: { username: config.apiKey, password: config.apiSecret || '' },
          });
        } else {
          if (config.apiKey) {
            await axios.post(`${config.type === 'generic' ? (process.env.ATS_BASE_URL || '') : ''}/api/candidates`, {
              name: student.name,
              email: student.email,
              phone: student.phone,
              job_id: jobId,
              source: 'PlacementPro',
            }, { headers: { Authorization: `Bearer ${config.apiKey}` } });
          }
        }
        pushed++;
      } catch (e) {
        errors.push({ email: student.email, error: e.message });
      }
    }
    await query(
      `INSERT INTO ats_push_logs (student_ids, status, provider_response)
       VALUES ($1, $2, $3)`,
      [JSON.stringify(studentIds), errors.length ? 'failed' : 'success', JSON.stringify({ pushed, errors })]
    );
    logger.info({ pushed, errors: errors.length }, 'ATS push completed');
    res.json({ message: `Pushed ${pushed} candidates`, pushed, errors });
  } catch (err) {
    logger.error({ err }, 'ATS push failed');
    res.status(500).json({ error: 'Failed to push candidates: ' + err.message });
  }
}

async function getPushLogs(req, res) {
  const { rows } = await query('SELECT * FROM ats_push_logs ORDER BY created_at DESC LIMIT 50');
  res.json({ logs: rows });
}

module.exports = { pushCandidate, getPushLogs };
