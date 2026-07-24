const { query } = require('../db');

async function toggleBookmark(req, res) {
  const { questionId, testId } = req.body;
  if (!questionId) return res.status(400).json({ error: 'questionId required' });

  const { rows: existing } = await query(
    'SELECT id FROM bookmarked_questions WHERE user_id=$1 AND question_id=$2',
    [req.user.id, questionId]
  );

  if (existing.length) {
    await query('DELETE FROM bookmarked_questions WHERE id=$1', [existing[0].id]);
    return res.json({ bookmarked: false });
  }

  await query(
    'INSERT INTO bookmarked_questions (user_id, question_id, test_id) VALUES ($1,$2,$3)',
    [req.user.id, questionId, testId || null]
  );
  res.json({ bookmarked: true });
}

async function listBookmarks(req, res) {
  const { rows: bookmarks } = await query(
    `SELECT bq.id as bookmark_id, bq.created_at as bookmarked_at,
            q.id as question_id, q.text, q.options, q.correct_answer, q.explanation, q.marks, q.difficulty, q.genre,
            t.id as test_id, t.title as test_title
     FROM bookmarked_questions bq
     JOIN questions q ON bq.question_id = q.id
     LEFT JOIN tests t ON bq.test_id = t.id
     WHERE bq.user_id=$1
     ORDER BY bq.created_at DESC`,
    [req.user.id]
  );
  res.json({ bookmarks });
}

async function removeBookmark(req, res) {
  const { id } = req.params;
  const { rows } = await query(
    'DELETE FROM bookmarked_questions WHERE id=$1 AND user_id=$2 RETURNING id',
    [id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Bookmark not found' });
  res.json({ message: 'Bookmark removed' });
}

module.exports = { toggleBookmark, listBookmarks, removeBookmark };