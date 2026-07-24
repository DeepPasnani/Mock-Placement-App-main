const { request } = require('@playwright/test');

async function globalSetup() {
  const baseURL = process.env.BASE_URL || 'http://localhost:2828';
  const apiURL = process.env.API_URL || 'http://localhost:5000';

  const ctx = await request.newContext({ baseURL: apiURL });

  // Create admin user via API
  try {
    await ctx.post('/api/auth/register', {
      data: {
        name: 'Test Admin',
        email: 'admin@test.edu',
        password: 'testpass123',
        role: 'super_admin',
        department: 'Computer Engineering',
      },
    });
  } catch {
    // user may already exist
  }

  // Create student user
  try {
    await ctx.post('/api/auth/register', {
      data: {
        name: 'Test Student',
        email: 'student@test.edu',
        password: 'testpass123',
        department: 'Computer Engineering',
        rollNumber: 'TEST001',
        batch: '2025',
      },
    });
  } catch {
    // user may already exist
  }

  // Promote admin
  try {
    const loginRes = await ctx.post('/api/auth/login', {
      data: { email: 'admin@test.edu', password: 'testpass123' },
    });
    const { token } = await loginRes.json();
    const { rows } = await ctx.post('/api/users/admin', {
      headers: { Authorization: `Bearer ${token}` },
      data: { email: 'admin@test.edu' },
    });
  } catch {
    // may already be admin
  }

  await ctx.dispose();
}

module.exports = globalSetup;
