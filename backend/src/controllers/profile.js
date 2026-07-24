const { query } = require('../db');
const { cloudinary } = require('../services/cloudinary');

async function getProfile(req, res) {
  const { id } = req.params;
  const { rows: [user] } = await query(
    `SELECT id, name, email, role, department, branch, roll_number, avatar_url,
            bio, skills, github_url, linkedin_url, phone, resume_url, created_at
     FROM users WHERE id=$1`, [id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { rows: projects } = await query(
    'SELECT * FROM projects WHERE user_id=$1 ORDER BY created_at DESC', [id]
  );
  const { rows: certifications } = await query(
    'SELECT * FROM certifications WHERE user_id=$1 ORDER BY issue_date DESC NULLS LAST', [id]
  );

  res.json({ user, projects, certifications });
}

async function updateProfile(req, res) {
  const { bio, skills, github_url, linkedin_url, phone } = req.body;
  const fields = [];
  const params = [];

  if (bio !== undefined) { params.push(bio); fields.push(`bio=$${params.length}`); }
  if (skills !== undefined) { params.push(JSON.stringify(skills)); fields.push(`skills=$${params.length}`); }
  if (github_url !== undefined) { params.push(github_url); fields.push(`github_url=$${params.length}`); }
  if (linkedin_url !== undefined) { params.push(linkedin_url); fields.push(`linkedin_url=$${params.length}`); }
  if (phone !== undefined) { params.push(phone); fields.push(`phone=$${params.length}`); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.user.id);
  const { rows: [user] } = await query(
    `UPDATE users SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${params.length} RETURNING id, name, email, bio, skills, github_url, linkedin_url, phone, resume_url`,
    params
  );
  res.json({ user });
}

async function uploadResume(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const url = req.file.path;
  const { rows: [user] } = await query(
    'UPDATE users SET resume_url=$1, updated_at=NOW() WHERE id=$2 RETURNING id, name, email, resume_url',
    [url, req.user.id]
  );
  res.json({ user });
}

async function addProject(req, res) {
  const { title, description, technologies, project_url, github_url, image_url } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const { rows: [project] } = await query(
    `INSERT INTO projects (user_id, title, description, technologies, project_url, github_url, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.id, title, description, JSON.stringify(technologies || []), project_url, github_url, image_url]
  );
  res.status(201).json({ project });
}

async function updateProject(req, res) {
  const { id } = req.params;
  const { title, description, technologies, project_url, github_url, image_url } = req.body;
  const fields = [];
  const params = [];

  if (title !== undefined) { params.push(title); fields.push(`title=$${params.length}`); }
  if (description !== undefined) { params.push(description); fields.push(`description=$${params.length}`); }
  if (technologies !== undefined) { params.push(JSON.stringify(technologies)); fields.push(`technologies=$${params.length}`); }
  if (project_url !== undefined) { params.push(project_url); fields.push(`project_url=$${params.length}`); }
  if (github_url !== undefined) { params.push(github_url); fields.push(`github_url=$${params.length}`); }
  if (image_url !== undefined) { params.push(image_url); fields.push(`image_url=$${params.length}`); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(id, req.user.id);
  const { rows: [project] } = await query(
    `UPDATE projects SET ${fields.join(', ')} WHERE id=$${params.length-1} AND user_id=$${params.length} RETURNING *`,
    params
  );
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ project });
}

async function deleteProject(req, res) {
  const { id } = req.params;
  const { rows } = await query('DELETE FROM projects WHERE id=$1 AND user_id=$2 RETURNING id', [id, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  res.json({ message: 'Project deleted' });
}

async function addCertification(req, res) {
  const { name, issuer, issue_date, expiry_date, credential_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const { rows: [cert] } = await query(
    `INSERT INTO certifications (user_id, name, issuer, issue_date, expiry_date, credential_url)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.id, name, issuer, issue_date, expiry_date, credential_url]
  );
  res.status(201).json({ certification: cert });
}

async function updateCertification(req, res) {
  const { id } = req.params;
  const { name, issuer, issue_date, expiry_date, credential_url } = req.body;
  const fields = [];
  const params = [];

  if (name !== undefined) { params.push(name); fields.push(`name=$${params.length}`); }
  if (issuer !== undefined) { params.push(issuer); fields.push(`issuer=$${params.length}`); }
  if (issue_date !== undefined) { params.push(issue_date); fields.push(`issue_date=$${params.length}`); }
  if (expiry_date !== undefined) { params.push(expiry_date); fields.push(`expiry_date=$${params.length}`); }
  if (credential_url !== undefined) { params.push(credential_url); fields.push(`credential_url=$${params.length}`); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(id, req.user.id);
  const { rows: [cert] } = await query(
    `UPDATE certifications SET ${fields.join(', ')} WHERE id=$${params.length-1} AND user_id=$${params.length} RETURNING *`,
    params
  );
  if (!cert) return res.status(404).json({ error: 'Certification not found' });
  res.json({ certification: cert });
}

async function deleteCertification(req, res) {
  const { id } = req.params;
  const { rows } = await query('DELETE FROM certifications WHERE id=$1 AND user_id=$2 RETURNING id', [id, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Certification not found' });
  res.json({ message: 'Certification deleted' });
}

module.exports = {
  getProfile, updateProfile, uploadResume,
  addProject, updateProject, deleteProject,
  addCertification, updateCertification, deleteCertification,
};