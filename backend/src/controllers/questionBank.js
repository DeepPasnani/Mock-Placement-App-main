const { query } = require('../db');

/* ═══════════════════════════════════════════════════════════
 * Question Bank — reusable MCQ / coding questions that admins
 * can build up over time and pull into any test, instead of
 * re-typing the same aptitude/DSA questions for every drive.
 *
 * Ported over from the Next.js UI-redesign prototype and wired
 * to a real Postgres-backed endpoint here.
 * ═══════════════════════════════════════════════════════════ */

// ── GET /api/question-bank?type=mcq&genre=technical&search=heap ──
async function listBank(req, res) {
  const { type, genre, search } = req.query;
  const conditions = [];
  const params = [];

  if (type) { params.push(type); conditions.push(`type = $${params.length}`); }
  if (genre && genre !== 'all') { params.push(genre); conditions.push(`genre = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`data->>'text' ILIKE $${params.length} OR data->>'title' ILIKE $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM bank_questions ${where} ORDER BY created_at DESC`,
    params
  );
  res.json({ questions: rows });
}

// ── POST /api/question-bank ───────────────────────────────────
async function createBank(req, res) {
  const { type, data, genre, difficulty, marks, tags } = req.body;

  if (!type || !['mcq', 'coding'].includes(type)) {
    return res.status(400).json({ error: 'type must be "mcq" or "coding"' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'data payload is required' });
  }

  const { rows: [question] } = await query(
    `INSERT INTO bank_questions (type, data, genre, difficulty, marks, tags, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [type, JSON.stringify(data), genre || 'general', difficulty || 'medium', marks || (type === 'mcq' ? 2 : 10), tags || null, req.user.id]
  );

  res.status(201).json({ question });
}

// ── POST /api/question-bank/import  { type, items: [...] } ────
// Bulk JSON import, mirrors the "Import JSON" flow from the
// prototype's Question Bank UI.
async function bulkImportBank(req, res) {
  const { type, items } = req.body;

  if (!type || !['mcq', 'coding'].includes(type)) {
    return res.status(400).json({ error: 'type must be "mcq" or "coding"' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }

  const inserted = [];
  for (const item of items) {
    const { genre, difficulty, marks, tags, ...data } = item;
    const { rows: [question] } = await query(
      `INSERT INTO bank_questions (type, data, genre, difficulty, marks, tags, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [type, JSON.stringify(data), genre || 'general', difficulty || 'medium', marks || (type === 'mcq' ? 2 : 10), tags || null, req.user.id]
    );
    inserted.push(question);
  }

  res.status(201).json({ message: `Imported ${inserted.length} question(s)`, questions: inserted });
}

// ── DELETE /api/question-bank/:id ─────────────────────────────
async function deleteBank(req, res) {
  const { id } = req.params;
  await query('DELETE FROM bank_questions WHERE id = $1', [id]);
  res.json({ message: 'Question removed from bank' });
}

module.exports = { listBank, createBank, bulkImportBank, deleteBank };
