const { query } = require('../db');

async function listDrives(req, res) {
  const { rows } = await query(
    'SELECT d.*, u.name as created_by_name FROM drives d LEFT JOIN users u ON d.created_by = u.id ORDER BY d.created_at DESC'
  );
  res.json({ drives: rows });
}

async function getDrive(req, res) {
  const { id } = req.params;
  const { rows: [drive] } = await query('SELECT * FROM drives WHERE id = $1', [id]);
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  const { rows: tests } = await query(
    `SELECT dt.*, t.title as test_title, t.status as test_status, t.duration_minutes,
            t.settings, t.start_time as test_start, t.end_time as test_end
     FROM drive_tests dt JOIN tests t ON dt.test_id = t.id
     WHERE dt.drive_id = $1 ORDER BY dt.round_number, dt.order_index`,
    [id]
  );
  const { rows: batches } = await query(
    `SELECT db.*, b.name as batch_name, b.department
     FROM drive_batches db JOIN batches b ON db.batch_id = b.id
     WHERE db.drive_id = $1`,
    [id]
  );
  res.json({ drive, tests, batches });
}

async function createDrive(req, res) {
  const { title, description, department, start_time, end_time, mcq_duration_minutes, coding_duration_minutes, passing_score } = req.body;
  if (!title || !department) return res.status(400).json({ error: 'Title and department required' });

  const { rows: [drive] } = await query(
    `INSERT INTO drives (title, description, department, start_time, end_time, mcq_duration_minutes, coding_duration_minutes, passing_score, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [title, description || '', department, start_time || null, end_time || null, mcq_duration_minutes || 60, coding_duration_minutes || 120, passing_score || 40, req.user.id]
  );
  res.status(201).json({ drive });
}

async function updateDrive(req, res) {
  const { id } = req.params;
  const { title, description, department, start_time, end_time, status, mcq_duration_minutes, coding_duration_minutes, passing_score } = req.body;

  const fields = []; const params = [];
  if (title !== undefined) { params.push(title); fields.push(`title=$${params.length}`); }
  if (description !== undefined) { params.push(description); fields.push(`description=$${params.length}`); }
  if (department !== undefined) { params.push(department); fields.push(`department=$${params.length}`); }
  if (start_time !== undefined) { params.push(start_time); fields.push(`start_time=$${params.length}`); }
  if (end_time !== undefined) { params.push(end_time); fields.push(`end_time=$${params.length}`); }
  if (status !== undefined) { params.push(status); fields.push(`status=$${params.length}`); }
  if (mcq_duration_minutes !== undefined) { params.push(mcq_duration_minutes); fields.push(`mcq_duration_minutes=$${params.length}`); }
  if (coding_duration_minutes !== undefined) { params.push(coding_duration_minutes); fields.push(`coding_duration_minutes=$${params.length}`); }
  if (passing_score !== undefined) { params.push(passing_score); fields.push(`passing_score=$${params.length}`); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  fields.push('updated_at=NOW()');
  params.push(id);
  const { rows: [drive] } = await query(
    `UPDATE drives SET ${fields.join(', ')} WHERE id=$${params.length} RETURNING *`,
    params
  );
  if (!drive) return res.status(404).json({ error: 'Drive not found' });
  res.json({ drive });
}

async function deleteDrive(req, res) {
  const { id } = req.params;
  await query('DELETE FROM drives WHERE id = $1', [id]);
  res.json({ message: 'Drive deleted' });
}

async function addTestToDrive(req, res) {
  const { id } = req.params;
  const { test_id, round_number, round_type, order_index } = req.body;
  if (!test_id) return res.status(400).json({ error: 'test_id required' });

  const { rows: [mapping] } = await query(
    `INSERT INTO drive_tests (drive_id, test_id, round_number, round_type, order_index)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (drive_id, test_id) DO NOTHING RETURNING *`,
    [id, test_id, round_number || 1, round_type || 'aptitude', order_index || 0]
  );
  if (!mapping) return res.status(400).json({ error: 'Test already added to this drive' });
  res.status(201).json({ mapping });
}

async function removeTestFromDrive(req, res) {
  const { id, testId } = req.params;
  await query('DELETE FROM drive_tests WHERE drive_id = $1 AND test_id = $2', [id, testId]);
  res.json({ message: 'Test removed from drive' });
}

async function addBatchToDrive(req, res) {
  const { id } = req.params;
  const { batch_id } = req.body;
  if (!batch_id) return res.status(400).json({ error: 'batch_id required' });

  const { rows: [mapping] } = await query(
    'INSERT INTO drive_batches (drive_id, batch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *',
    [id, batch_id]
  );
  if (!mapping) return res.status(400).json({ error: 'Batch already mapped to this drive' });
  res.status(201).json({ mapping });
}

async function removeBatchFromDrive(req, res) {
  const { id, batchId } = req.params;
  await query('DELETE FROM drive_batches WHERE drive_id = $1 AND batch_id = $2', [id, batchId]);
  res.json({ message: 'Batch removed from drive' });
}

async function getDriveStats(req, res) {
  const { id } = req.params;
  const { rows: [drive] } = await query('SELECT * FROM drives WHERE id = $1', [id]);
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  const { rows: testRows } = await query(
    'SELECT id, title FROM drive_tests dt JOIN tests t ON dt.test_id = t.id WHERE dt.drive_id = $1',
    [id]
  );
  const testIds = testRows.map(t => t.id);
  let stats = { total_submissions: 0, total_students: 0, passed: 0, avg_score: 0, test_breakdown: [] };

  if (testIds.length > 0) {
    const { rows: submissions } = await query(
      `SELECT s.score, s.max_score, s.status, s.test_id, u.name as user_name, u.email
       FROM submissions s JOIN users u ON s.user_id = u.id
       WHERE s.test_id = ANY($1::uuid[]) AND s.status = 'submitted'`,
      [testIds]
    );
    stats.total_submissions = submissions.length;
    const uniqueStudents = new Set(submissions.map(s => s.email));
    stats.total_students = uniqueStudents.size;
    const scored = submissions.filter(s => s.max_score > 0);
    stats.avg_score = scored.length ? Math.round(scored.reduce((a, s) => a + (s.score / s.max_score) * 100, 0) / scored.length) : 0;
    stats.passed = scored.filter(s => (s.score / s.max_score) * 100 >= (drive.passing_score || 40)).length;

    stats.test_breakdown = testRows.map(t => {
      const tSubs = submissions.filter(s => s.test_id === t.id);
      const tScored = tSubs.filter(s => s.max_score > 0);
      return {
        test_id: t.id,
        test_title: t.title,
        submissions: tSubs.length,
        avg_score: tScored.length ? Math.round(tScored.reduce((a, s) => a + (s.score / s.max_score) * 100, 0) / tScored.length) : 0,
      };
    });
  }
  res.json({ stats });
}

module.exports = { listDrives, getDrive, createDrive, updateDrive, deleteDrive, addTestToDrive, removeTestFromDrive, addBatchToDrive, removeBatchFromDrive, getDriveStats };
