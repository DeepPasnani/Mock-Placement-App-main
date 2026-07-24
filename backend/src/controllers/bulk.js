const { query } = require('../db');

async function bulkDeleteTests(req, res) {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Test IDs required' });

  const { rowCount } = await query('DELETE FROM tests WHERE id = ANY($1::uuid[])', [ids]);
  res.json({ deleted: rowCount });
}

async function bulkArchiveTests(req, res) {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Test IDs required' });

  const { rowCount } = await query('UPDATE tests SET status=$1 WHERE id = ANY($2::uuid[])', ['archived', ids]);
  res.json({ archived: rowCount });
}

async function bulkDeleteQuestions(req, res) {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Question IDs required' });

  const { rowCount } = await query('DELETE FROM bank_questions WHERE id = ANY($1::uuid[])', [ids]);
  res.json({ deleted: rowCount });
}

async function bulkDeleteUsers(req, res) {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'User IDs required' });

  const { rowCount } = await query('DELETE FROM users WHERE id = ANY($1::uuid[]) AND role=$2', [ids, 'student']);
  res.json({ deleted: rowCount });
}

module.exports = { bulkDeleteTests, bulkArchiveTests, bulkDeleteQuestions, bulkDeleteUsers };
