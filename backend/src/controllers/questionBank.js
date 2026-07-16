const { query } = require('../db');

// ── CSV parsing (stdlib, no dependency) ──────────────────────
function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { rows: [], errors: [] };

  const headers = parseCsvLine(lines[0]);
  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      errors.push({ row: i + 1, message: `Expected ${headers.length} columns, got ${values.length}` });
      continue;
    }
    const row = {};
    headers.forEach((h, j) => { row[h.trim()] = (values[j] || '').trim(); });
    rows.push(row);
  }

  return { rows, errors };
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

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

// ── POST /api/question-bank/import-csv ───────────────────────
async function importCsv(req, res) {
  const csvText = req.body.csv;
  if (!csvText) return res.status(400).json({ error: 'CSV content required' });

  const { rows, errors: parseErrors } = parseCsv(csvText);
  if (!rows.length) {
    return res.status(400).json({ error: 'No valid rows found', parseErrors });
  }

  const inserted = [];
  const importErrors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (row.type === 'mcq') {
        if (!row.text || !row.optionA || !row.optionB || !row.optionC || !row.optionD || row.correctAnswer === undefined) {
          importErrors.push({ row: i + 2, message: 'MCQ requires: text, optionA-D, correctAnswer' });
          continue;
        }
        const data = {
          text: row.text,
          options: [row.optionA, row.optionB, row.optionC, row.optionD],
          correctAnswer: parseInt(row.correctAnswer),
        };
        const { rows: [q] } = await query(
          `INSERT INTO bank_questions (type, data, genre, difficulty, marks, tags, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          ['mcq', JSON.stringify(data), row.genre || 'general', row.difficulty || 'medium',
           parseInt(row.marks) || 2, null, req.user.id]
        );
        inserted.push(q);
      } else if (row.type === 'coding') {
        if (!row.title || !row.description) {
          importErrors.push({ row: i + 2, message: 'Coding requires: title, description' });
          continue;
        }
        const data = {
          title: row.title,
          description: row.description,
          sampleInput: row.sampleInput || '',
          sampleOutput: row.sampleOutput || '',
          testCases: row.testCases ? JSON.parse(row.testCases) : [],
        };
        const { rows: [q] } = await query(
          `INSERT INTO bank_questions (type, data, genre, difficulty, marks, tags, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          ['coding', JSON.stringify(data), row.genre || 'general', row.difficulty || 'medium',
           parseInt(row.marks) || 10, null, req.user.id]
        );
        inserted.push(q);
      } else {
        importErrors.push({ row: i + 2, message: `Unknown type "${row.type}" — must be "mcq" or "coding"` });
      }
    } catch (err) {
      importErrors.push({ row: i + 2, message: err.message });
    }
  }

  res.status(201).json({
    message: `Imported ${inserted.length} question(s)`,
    created: inserted.length,
    errors: [...parseErrors, ...importErrors],
  });
}

module.exports = { listBank, createBank, bulkImportBank, importCsv, deleteBank };
