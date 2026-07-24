const { query } = require('../db');
const { cacheDelPattern } = require('../db/redis');

// ── GET /api/batches ─────────────────────────────────────────
async function listBatches(req, res) {
  const { rows } = await query(
    'SELECT * FROM batches ORDER BY department, name'
  );
  res.json({ batches: rows });
}

// ── POST /api/batches ────────────────────────────────────────
async function createBatch(req, res) {
  const { name, department, yearOfStudy } = req.body;
  if (!name || !department) {
    return res.status(400).json({ error: 'Name and department required' });
  }

  const { rows: [batch] } = await query(
    `INSERT INTO batches (name, department, year_of_study)
     VALUES ($1,$2,$3) ON CONFLICT (name, department) DO UPDATE SET
       year_of_study = EXCLUDED.year_of_study
     RETURNING *`,
    [name, department, yearOfStudy || 1]
  );

  res.status(201).json({ batch });
}

// ── DELETE /api/batches/:id ──────────────────────────────────
async function deleteBatch(req, res) {
  const { id } = req.params;
  await query('DELETE FROM batches WHERE id = $1', [id]);
  res.json({ message: 'Batch deleted' });
}

// ── POST /api/batches/assign ─────────────────────────────────
async function assignBatch(req, res) {
  const { userId, batchId, yearOfStudy, semester } = req.body;
  if (!userId || !batchId) {
    return res.status(400).json({ error: 'userId and batchId required' });
  }

  // Also update user's batch/year for simpler queries
  await query(
    `UPDATE users SET batch = (SELECT name FROM batches WHERE id = $2), year_of_study = $3 WHERE id = $1`,
    [userId, batchId, yearOfStudy || 1]
  );

  const { rows: [assignment] } = await query(
    `INSERT INTO student_batches (user_id, batch_id, year_of_study, semester)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, semester) DO UPDATE SET
       batch_id = EXCLUDED.batch_id, year_of_study = EXCLUDED.year_of_study
     RETURNING *`,
    [userId, batchId, yearOfStudy || 1, semester || '2026-Spring']
  );

  res.json({ assignment });
}

// ── POST /api/tests/:id/batches ──────────────────────────────
async function mapTestBatches(req, res) {
  const { id: testId } = req.params;
  const { batchIds, sectionMapping } = req.body;

  if (!Array.isArray(batchIds)) {
    return res.status(400).json({ error: 'batchIds array required' });
  }

  // Remove existing mappings
  await query('DELETE FROM test_batches WHERE test_id = $1', [testId]);

  // Insert new mappings
  for (const batchId of batchIds) {
    const mapping = sectionMapping?.[batchId] || {};
    await query(
      'INSERT INTO test_batches (test_id, batch_id, section_mapping) VALUES ($1,$2,$3)',
      [testId, batchId, JSON.stringify(mapping)]
    );
  }

  await cacheDelPattern(`test:${testId}:full:`);
  res.json({ message: `Mapped ${batchIds.length} batch(es) to test` });
}


// ── GET /api/tests/:id/batches ───────────────────────────────
async function getTestBatches(req, res) {
  const { id: testId } = req.params;

  const { rows } = await query(
    `SELECT tb.*, b.name as batch_name, b.department
     FROM test_batches tb
     JOIN batches b ON tb.batch_id = b.id
     WHERE tb.test_id = $1
     ORDER BY b.name`,
    [testId]
  );

  res.json({ batches: rows });
}

module.exports = { listBatches, createBatch, deleteBatch, assignBatch, mapTestBatches, getTestBatches };
