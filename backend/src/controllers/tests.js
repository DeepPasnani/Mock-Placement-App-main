const { query, getClient } = require('../db');
const { cacheGet, cacheSet, cacheDel, cacheDelPattern } = require('../db/redis');

// ── GET /api/tests (admin: own only; super_admin: all; student: published + their department)
async function listTests(req, res) {
  const userRole = req.user.role;
  const userId = req.user.id;
  const userDepartment = req.user.department;

  let whereClause = '';
  
  if (userRole === 'super_admin') {
    // Super admin sees all tests
    whereClause = '';
  } else if (userRole === 'admin') {
    // Admin sees only their own tests
    whereClause = `WHERE t.created_by = '${userId}'`;
  } else if (userRole === 'student') {
    // Student sees only published tests for their department
    if (userDepartment) {
      whereClause = `WHERE t.status = 'published' AND t.department = '${userDepartment}'`;
    } else {
      whereClause = `WHERE t.status = 'published' AND t.department = 'all'`; // fallback
    }
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
  `);

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
    // Check department match for students
    if (userDepartment && test.department !== userDepartment && test.department !== 'all') {
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
  const { title, description, status, startTime, endTime, durationMinutes, settings, sections, department } = req.body;

  if (!title) return res.status(400).json({ error: 'Title required' });
  if (!department) return res.status(400).json({ error: 'Department is required' });

  const validDepartments = [
    'Computer Engineering',
    'Computer Science and Design',
    'Aeronautical Engineering',
    'Electrical Engineering',
    'Electronics and Communication Engineering',
    'Civil Engineering'
  ];
  if (!validDepartments.includes(department)) {
    return res.status(400).json({ error: 'Invalid department' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: [test] } = await client.query(
      `INSERT INTO tests (title, description, status, start_time, end_time, duration_minutes, department, settings, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, description, status || 'draft', startTime || null, endTime || null,
       durationMinutes || 90, department, JSON.stringify(settings || {}), req.user.id]
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
                [section.id, q.type || 'mcq', q.text, q.imageUrl || null,
                 JSON.stringify(q.options || []), JSON.stringify(q.optionImages || []),
                 JSON.stringify(q.correctAnswer), q.explanation, q.marks || 2, q.difficulty || 'medium', q.genre || 'general', q.questionSet || 'A', qi]
              );
            } else {
              await client.query(
                `INSERT INTO coding_problems (section_id, title, description, image_url, input_format, output_format,
                 constraints, sample_input, sample_output, explanation, test_cases, starter_code,
                 time_limit_seconds, memory_limit_mb, marks, difficulty, tags, order_index)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
                [section.id, q.title, q.description, q.imageUrl || null, q.inputFormat, q.outputFormat,
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
  const { title, description, status, startTime, endTime, durationMinutes, settings } = req.body;

  const { rows } = await query(
    `UPDATE tests SET title=$1, description=$2, status=$3, start_time=$4, end_time=$5,
     duration_minutes=$6, settings=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
    [title, description, status, startTime || null, endTime || null,
     durationMinutes, JSON.stringify(settings || {}), id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Test not found' });

  await cacheDelPattern(`test:${id}:full:`);
  res.json({ test: rows[0] });
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

module.exports = { listTests, getTest, createTest, updateTest, deleteTest, duplicateTest };
