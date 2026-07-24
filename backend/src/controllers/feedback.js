const { query } = require('../db');

async function submitFeedback(req, res) {
  const { questionId, issueType, comment } = req.body;
  if (!questionId || !issueType) return res.status(400).json({ error: 'questionId and issueType required' });
  if (!['wrong_answer', 'ambiguous', 'formatting', 'other'].includes(issueType)) {
    return res.status(400).json({ error: 'Invalid issue type' });
  }

  const { rows: [feedback] } = await query(
    `INSERT INTO question_feedback (question_id, user_id, issue_type, comment)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [questionId, req.user.id, issueType, comment]
  );
  res.status(201).json({ feedback });
}

async function listFeedback(req, res) {
  const { status, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  let where = 'WHERE 1=1';

  if (status) { params.push(status); where += ` AND qf.status=$${params.length}`; }

  params.push(limit, offset);
  const { rows: feedbacks } = await query(
    `SELECT qf.*, q.text as question_text, u.name as user_name, u.email as user_email
     FROM question_feedback qf
     JOIN questions q ON qf.question_id = q.id
     JOIN users u ON qf.user_id = u.id
     ${where}
     ORDER BY qf.created_at DESC
     LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  );

  const { rows: [{ count }] } = await query(
    `SELECT COUNT(*) FROM question_feedback qf ${where}`,
    params.slice(0, -2)
  );

  res.json({ feedbacks, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
}

async function updateFeedbackStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  if (!['pending', 'reviewed', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { rows: [feedback] } = await query(
    'UPDATE question_feedback SET status=$1 WHERE id=$2 RETURNING *',
    [status, id]
  );
  if (!feedback) return res.status(404).json({ error: 'Feedback not found' });
  res.json({ feedback });
}

module.exports = { submitFeedback, listFeedback, updateFeedbackStatus };