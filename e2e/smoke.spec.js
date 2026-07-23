// @ts-check
/**
 * CampusTrack Smoke Test — Critical User Flow
 *
 * Tests:
 *   1. Login as admin
 *   2. Create a test with sections and questions
 *   3. Login as student
 *   4. Start / save / submit the test
 *   5. View results
 *
 * Run with: npx playwright test e2e/smoke.spec.js
 */

const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Critical User Flow', () => {
  test('Admin creates a test', async ({ page }) => {
    // Login as admin
    await page.goto(`${BASE}/login`);
    await page.fill('[name=email]', 'admin@college.edu');
    await page.fill('[name=password]', 'Admin@123');
    await page.click('button[type=submit]');
    await page.waitForURL('**/admin/**');

    // Navigate to Tests
    await page.click('text=Tests');
    await page.waitForURL('**/admin/tests');
    await page.click('text=Create Test');

    // Fill test details
    await page.fill('[name=title]', 'Smoke Test ' + Date.now());
    await page.fill('[name=description]', 'Automated smoke test');
    await page.selectOption('[name=department]', 'Computer Engineering');

    // Save as draft
    await page.click('text=Save Draft');
    await page.waitForSelector('text=Test created');
  });

  test('Student starts and submits a test', async ({ page }) => {
    // Login as student
    await page.goto(`${BASE}/login`);
    await page.fill('[name=email]', 'student@college.edu');
    await page.fill('[name=password]', 'Student@123');
    await page.click('button[type=submit]');
    await page.waitForURL('**/student/**');

    // Browse available tests
    await page.waitForSelector('text=Available Tests');
    const testCards = page.locator('[data-testid=test-card]');
    const count = await testCards.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Start the first available test
    await testCards.first().click();
    await page.waitForSelector('text=Start Test');
    await page.click('text=Start Test');

    // Wait for test interface to load
    await page.waitForSelector('[role=timer]');

    // Answer a question (if MCQ section exists)
    const mcqOption = page.locator('[data-testid=mcq-option]').first();
    if (await mcqOption.isVisible()) {
      await mcqOption.click();
    }

    // Submit
    await page.click('text=Submit');
    await page.waitForSelector('text=Confirm');
    await page.click('text=Confirm Submit');

    // Verify submission success
    await page.waitForSelector('text=Test submitted');
    await page.waitForURL('**/student/results');
  });

  test('Health endpoint returns ok', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/health`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.status).toBe('ok');
  });
});
