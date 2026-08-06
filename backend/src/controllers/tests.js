const { query, getClient } = require('../db');
const { cacheGet, cacheSet, cacheDel, cacheDelPattern } = require('../db/redis');
const { ALLOWED_DEPARTMENTS } = require('../config/departments');

const VALID_DEPARTMENTS = ALLOWED_DEPARTMENTS;

function normalizeDepartments({ department, departments }) {
  let list = Array.isArray(departments) ? departments.slice() : [];
  if (!list.length && department) list = [department];
  list = [...new Set(list.map((d) => String(d || '').trim()).filter(Boolean))];

  if (!list.length) {
    const err = new Error('At least one target department is required');
    err.status = 400;
    throw err;
  }

  if (list.includes('all')) {
    return { departments: ['all'], department: 'all' };
  }

  for (const d of list) {
    if (!VALID_DEPARTMENTS.includes(d)) {
      const err = new Error(`Invalid department: ${d}`);
      err.status = 400;
      throw err;
    }
  }

  return { departments: list, department: list[0] };
}

function studentCanAccessTest(test, userDepartment, userBatch, userYear) {
  // Department check
  const depts = Array.isArray(test.departments) && test.departments.length
    ? test.departments
    : (test.department ? [test.department] : []);
  if (depts.length && !depts.includes('all')) {
    const deptOk = depts.includes(userDepartment) || test.department === userDepartment;
    if (!deptOk) return false;
  }

  // Batch check: if specific batches are selected, student must be in one.
  const batchList = Array.isArray(test.batches) ? test.batches.filter(Boolean) : [];
  if (batchList.length && !batchList.includes('all')) {
    if (!userBatch || !batchList.includes(userBatch)) return false;
  }

  // Year check: if specific years are selected, student's year must match.
  const years = Array.isArray(test.years) ? test.years.filter(y => y !== null && y !== '') : [];
  if (years.length && !years.includes('all')) {
    const yStr = String(userYear);
    if (!userYear || !years.map(String).includes(yStr)) return false;
  }

  return true;
}

// ── GET /api/tests (admin/super_admin: all tests, so every admin account can
// see tests created by teammates; student: published + their department)
async function listTests(req, res) {
  const userRole = req.user.role;
  const userDepartment = req.user.department;
  const userBatch = req.user.batch;
  const userYear = req.user.year_of_study;

  let whereClause = '';
  const params = [];

  if (userRole === 'super_admin' || userRole === 'admin') {
    whereClause = '';
  } else if (userRole === 'student') {
    whereClause = 'WHERE t.status = $1';
    params.push('published');

    const conditions = [];
    const addParam = (v) => {
      params.push(v);
      return `$${params.length}`;
    };

    if (userDepartment) {
      const p = addParam(userDepartment);
      conditions.push(`(t.department = 'all' OR t.department = ${p}
          OR COALESCE(t.departments, '[]'::jsonb) @> to_jsonb(${p}::text)
          OR COALESCE(t.departments, '[]'::jsonb) @> '"all"'::jsonb)`);
    } else {
      conditions.push(`(t.department = 'all' OR COALESCE(t.departments, '[]'::jsonb) @> '"all"'::jsonb)`);
    }

    if (userBatch) {
      const p = addParam(userBatch);
      conditions.push(`(COALESCE(t.batches, '[]'::jsonb) = '[]'::jsonb
          OR COALESCE(t.batches, '[]'::jsonb) @> '"all"'::jsonb
          OR COALESCE(t.batches, '[]'::jsonb) @> to_jsonb(${p}::text))`);
    } else {
      conditions.push(`(COALESCE(t.batches, '[]'::jsonb) = '[]'::jsonb
          OR COALESCE(t.batches, '[]'::jsonb) @> '"all"'::jsonb)`);
    }

    if (userYear) {
      const p = addParam(userYear);
      conditions.push(`(COALESCE(t.years, '[]'::jsonb) = '[]'::jsonb
          OR COALESCE(t.years, '[]'::jsonb) @> '"all"'::jsonb
          OR COALESCE(t.years, '[]'::jsonb) @> to_jsonb(${p}::text))`);
    } else {
      conditions.push(`(COALESCE(t.years, '[]'::jsonb) = '[]'::jsonb
          OR COALESCE(t.years, '[]'::jsonb) @> '"all"'::jsonb)`);
    }

    whereClause += ' AND ' + conditions.join(' AND ');
  }

  const { rows } = await query(`
    SELECT t.*,
      u.name as created_by_name,
      (SELECT COUNT(*) FROM sections s WHERE s.test_id = t.id) as section_count,
      (SELECT COUNT(*) FROM submissions sub WHERE sub.test_id = t.id) as submission_count
    FROM tests t
    LEFT JOIN users u ON t.created_by = u.id
    ${whereClause}
    ORDER BY t.created_at DESC
  `, params);

  res.json({ tests: rows });
}

// ── GET /api/tests/:id (with all sections + questions)
async function getTest(req, res) {
  const { id } = req.params;
  const userRole = req.user.role;
  const userDepartment = req.user.department;
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  const cacheKey = `test:${id}:full:${isAdmin ? 'admin' : (req.user.batch || 'none')}`;
  if (!isAdmin) {
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);
  }

  const { rows: testRows } = await query('SELECT * FROM tests WHERE id = $1', [id]);
  if (!testRows.length) return res.status(404).json({ error: 'Test not found' });
  const test = testRows[0];

  // Check access permissions
  if (!isAdmin) {
    if (test.status !== 'published') {
      return res.status(403).json({ error: 'Test not available' });
    }
    if (!studentCanAccessTest(test, userDepartment, req.user.batch, req.user.year_of_study)) {
      return res.status(403).json({ error: 'Test not available for your department' });
    }
  }

  const { rows: sections } = await query(
    'SELECT * FROM sections WHERE test_id = $1 ORDER BY order_index',
    [id]
  );

  // Determine which MCQ "set" (A/B/C/D) this student's batch should see,
  // if the admin has configured a batch→set mapping for this test.
  let mySet = null;
  if (!isAdmin && req.user.batch) {
    const { rows: mapRows } = await query(
      `SELECT tb.section_mapping FROM test_batches tb
       JOIN batches b ON tb.batch_id = b.id
       WHERE tb.test_id = $1 AND b.name = $2 LIMIT 1`,
      [id, req.user.batch]
    );
    mySet = mapRows[0]?.section_mapping?.set || null;
  }

  for (const section of sections) {
    if (section.type === 'aptitude') {
      const { rows: questions } = await query(
        `SELECT id, type, text, image_url, options, option_images, marks, difficulty, genre, question_set, order_index
         ${isAdmin ? ', correct_answer, explanation' : ''}
         FROM questions WHERE section_id = $1 ORDER BY order_index`,
        [section.id]
      );
      section.questions = isAdmin || !mySet
        ? questions
        : questions.filter(q => (q.question_set || 'A') === mySet);
    } else {
      const { rows: problems } = await query(
        `SELECT id, title, description, image_url, input_format, output_format, constraints,
         sample_input, sample_output, starter_code, marks, difficulty, tags, time_limit_seconds, memory_limit_mb
         ${isAdmin ? ', test_cases, explanation' : ", (SELECT jsonb_agg(tc) FROM jsonb_array_elements(test_cases) tc WHERE NOT (tc->>'isHidden')::boolean) as test_cases"}
         FROM coding_problems WHERE section_id = $1 ORDER BY order_index`,
        [section.id]
      );
      section.questions = problems;
    }
  }

  const result = { ...test, sections };
  if (!isAdmin) await cacheSet(cacheKey, result, 300);

  res.json(result);
}

// ── POST /api/tests (admin only)
async function createTest(req, res) {
  const { title, description, status, startTime, endTime, durationMinutes, settings, sections, department, departments, years, batches } = req.body;

  if (!title) return res.status(400).json({ error: 'Title required' });

  let norm;
  try {
    norm = normalizeDepartments({ department, departments });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
const finalDepartment = norm.department;
  const finalDepartments = norm.departments;
  const finalYears = Array.isArray(years) ? years.filter(y => y !== null && y !== '').map(String) : [];
  const finalBatches = Array.isArray(batches) ? batches.filter(b => b !== null && b !== '').map(String) : [];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: [test] } = await client.query(
      `INSERT INTO tests (title, description, status, start_time, end_time, duration_minutes, department, departments, years, batches, settings, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [title, description, status || 'draft', startTime || null, endTime || null,
       durationMinutes || 90, finalDepartment, JSON.stringify(finalDepartments),
       JSON.stringify(finalYears), JSON.stringify(finalBatches), JSON.stringify(settings || {}), req.user.id]
    );

    if (sections?.length) {
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        const { rows: [section] } = await client.query(
          'INSERT INTO sections (test_id, name, type, order_index) VALUES ($1,$2,$3,$4) RETURNING *',
          [test.id, sec.name, sec.type, si]
        );

        if (sec.questions?.length) {
          for (let qi = 0; qi < sec.questions.length; qi++) {
            const q = sec.questions[qi];
            if (sec.type === 'aptitude') {
              await client.query(
                `INSERT INTO questions (section_id, type, text, image_url, options, option_images, correct_answer, explanation, marks, difficulty, genre, question_set, order_index)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [section.id, q.type || 'mcq', q.text, q.imageUrl || q.image_url || null,
                 JSON.stringify(q.options || []), JSON.stringify(q.optionImages || q.option_images || []),
                 JSON.stringify(q.correctAnswer), q.explanation, q.marks || 2, q.difficulty || 'medium', q.genre || 'general', q.questionSet || 'A', qi]
              );
            } else {
              await client.query(
                `INSERT INTO coding_problems (section_id, title, description, image_url, input_format, output_format,
                 constraints, sample_input, sample_output, explanation, test_cases, starter_code,
                 time_limit_seconds, memory_limit_mb, marks, difficulty, tags, order_index)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
                [section.id, q.title, q.description, q.imageUrl || q.image_url || null, q.inputFormat, q.outputFormat,
                 q.constraints, q.sampleInput, q.sampleOutput, q.explanation,
                 JSON.stringify(q.testCases || []), JSON.stringify(q.starterCode || {}),
                 q.timeLimit || 2, q.memoryLimit || 256, q.marks || 10, q.difficulty || 'medium', q.tags, qi]
              );
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ test, message: 'Test created successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── PUT /api/tests/:id
async function updateTest(req, res) {
  const { id } = req.params;
  const { title, description, status, startTime, endTime, durationMinutes, settings, sections, department, departments, years, batches } = req.body;

  let norm;
  try {
    norm = normalizeDepartments({ department, departments });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const finalDepartment = norm.department;
  const finalDepartments = norm.departments;
  const finalYears = Array.isArray(years) ? years.filter(y => y !== null && y !== '').map(String) : [];
  const finalBatches = Array.isArray(batches) ? batches.filter(b => b !== null && b !== '').map(String) : [];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE tests SET title=$1, description=$2, status=$3, start_time=$4, end_time=$5,
       duration_minutes=$6, department=$7, departments=$8, years=$9, batches=$10, settings=$11, updated_at=NOW() WHERE id=$12 RETURNING *`,
      [title, description, status, startTime || null, endTime || null,
       durationMinutes, finalDepartment, JSON.stringify(finalDepartments),
       JSON.stringify(finalYears), JSON.stringify(finalBatches), JSON.stringify(settings || {}), id]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Test not found' });
    }

    // Delete existing sections (questions cascade-deleted) and re-insert
    if (sections?.length) {
      await client.query('DELETE FROM sections WHERE test_id = $1', [id]);

      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        const { rows: [section] } = await client.query(
          'INSERT INTO sections (test_id, name, type, order_index) VALUES ($1,$2,$3,$4) RETURNING *',
          [id, sec.name, sec.type, si]
        );

        if (sec.questions?.length) {
          for (let qi = 0; qi < sec.questions.length; qi++) {
            const q = sec.questions[qi];
            if (sec.type === 'aptitude') {
              await client.query(
                `INSERT INTO questions (section_id, type, text, image_url, options, option_images, correct_answer, explanation, marks, difficulty, genre, question_set, order_index)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [section.id, q.type || 'mcq', q.text, q.imageUrl || q.image_url || null,
                 JSON.stringify(q.options || []), JSON.stringify(q.optionImages || q.option_images || []),
                 JSON.stringify(q.correctAnswer), q.explanation, q.marks || 2, q.difficulty || 'medium', q.genre || 'general', q.questionSet || 'A', qi]
              );
            } else {
              await client.query(
                `INSERT INTO coding_problems (section_id, title, description, image_url, input_format, output_format,
                 constraints, sample_input, sample_output, explanation, test_cases, starter_code,
                 time_limit_seconds, memory_limit_mb, marks, difficulty, tags, order_index)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
                [section.id, q.title, q.description, q.imageUrl || q.image_url || null, q.inputFormat, q.outputFormat,
                 q.constraints, q.sampleInput, q.sampleOutput, q.explanation,
                 JSON.stringify(q.testCases || []), JSON.stringify(q.starterCode || {}),
                 q.timeLimit || 2, q.memoryLimit || 256, q.marks || 10, q.difficulty || 'medium', q.tags, qi]
              );
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    client.release();

    await cacheDelPattern(`test:${id}:full:`);
    res.json({ test: rows[0], message: 'Test updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
}

// ── DELETE /api/tests/:id
async function deleteTest(req, res) {
  const { id } = req.params;
  await query('DELETE FROM tests WHERE id = $1', [id]);
  await cacheDelPattern(`test:${id}:full:`);
  res.json({ message: 'Test deleted' });
}

// ── POST /api/tests/:id/duplicate
async function duplicateTest(req, res) {
  const { id } = req.params;
  const { rows: [orig] } = await query('SELECT * FROM tests WHERE id = $1', [id]);
  if (!orig) return res.status(404).json({ error: 'Test not found' });

  req.body = {
    ...orig,
    title: `${orig.title} (Copy)`,
    status: 'draft',
    settings: orig.settings,
    sections: (await buildTestData(id)).sections,
  };
  return createTest(req, res);
}

async function buildTestData(testId) {
  const { rows: sections } = await query('SELECT * FROM sections WHERE test_id=$1 ORDER BY order_index', [testId]);
  for (const s of sections) {
    if (s.type === 'aptitude') {
      const { rows } = await query('SELECT * FROM questions WHERE section_id=$1 ORDER BY order_index', [s.id]);
      s.questions = rows;
    } else {
      const { rows } = await query('SELECT * FROM coding_problems WHERE section_id=$1 ORDER BY order_index', [s.id]);
      s.questions = rows;
    }
  }
  return { sections };
}

async function schedulePublish(req, res) {
  const { scheduled_publish_at } = req.body;
  if (!scheduled_publish_at) return res.status(400).json({ error: 'scheduled_publish_at required' });

  const { rows } = await query(
    'UPDATE tests SET scheduled_publish_at=$1 WHERE id=$2 RETURNING *',
    [scheduled_publish_at, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Test not found' });

  res.json({ test: rows[0] });
}

module.exports = { listTests, getTest, createTest, updateTest, deleteTest, duplicateTest, schedulePublish };
