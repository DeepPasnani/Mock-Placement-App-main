const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { apiLimiter, authLimiter, codeLimiter, bulkImportLimiter, emailLimiter } = require('../middleware/rateLimit');

// Apply blanket rate limiter to all /api routes
router.use(apiLimiter);
const { upload } = require('../services/cloudinary');
const { validate, bulkImportSchema, createTestSchema, submitTestSchema, sendEmailSchema } = require('../middleware/validate');

const authCtrl = require('../controllers/auth');
const testCtrl = require('../controllers/tests');
const subCtrl  = require('../controllers/submissions');
const userCtrl = require('../controllers/users');
const upCtrl   = require('../controllers/upload');

// ── Auth ──────────────────────────────────────────────────────
router.post('/auth/login',            authLimiter, authCtrl.login);
router.post('/auth/register',         authLimiter, authCtrl.register);
router.post('/auth/google',           authLimiter, authCtrl.googleLogin);
router.post('/auth/logout',           authenticate, authCtrl.logout);
router.get ('/auth/me',               authenticate, authCtrl.getMe);
router.post('/auth/change-password',  authenticate, authCtrl.changePassword);
router.post('/auth/forgot-password',  authLimiter,  authCtrl.forgotPassword);   // NEW
router.post('/auth/reset-password',   authLimiter,  authCtrl.resetPassword);    // NEW

// ── Tests ─────────────────────────────────────────────────────
router.get   ('/tests',                   authenticate, testCtrl.listTests);
router.get   ('/tests/:id',               authenticate, testCtrl.getTest);
router.post  ('/tests',                   authenticate, requireAdmin, validate(createTestSchema), testCtrl.createTest);
router.put   ('/tests/:id',               authenticate, requireAdmin, validate(createTestSchema), testCtrl.updateTest);
router.delete('/tests/:id',               authenticate, requireAdmin, testCtrl.deleteTest);
router.post  ('/tests/:id/duplicate',     authenticate, requireAdmin, testCtrl.duplicateTest);

// ── Submissions ───────────────────────────────────────────────
router.post('/submissions/start',          authenticate, subCtrl.startTest);
router.post('/submissions/save',           authenticate, subCtrl.saveAnswers);
router.post('/submissions/submit',         authenticate, validate(submitTestSchema), subCtrl.submitTest);
router.post('/submissions/run-code',       authenticate, codeLimiter, subCtrl.runCode);
router.get ('/submissions/my',             authenticate, subCtrl.getMySubmissions);
router.get ('/submissions/test/:testId',   authenticate, requireAdmin, subCtrl.getTestSubmissions);
router.get ('/submissions/test/:testId/export-pdf', authenticate, requireAdmin, subCtrl.exportResultsPdf);
router.delete('/submissions/:id',          authenticate, requireAdmin, subCtrl.deleteSubmission);
router.get ('/submissions/:id',            authenticate, subCtrl.getSubmission);

// ── Users ─────────────────────────────────────────────────────
router.get   ('/users',                authenticate, requireAdmin, userCtrl.listUsers);
router.get   ('/users/stats',          authenticate, requireAdmin, userCtrl.getStats);
router.post  ('/users/admin',          authenticate, requireSuperAdmin, userCtrl.createAdmin);
router.post  ('/users/bulk-import',    authenticate, requireAdmin, bulkImportLimiter, validate(bulkImportSchema), userCtrl.bulkImport);
router.post  ('/users/notify-test',    authenticate, requireAdmin, userCtrl.notifyTestScheduled); // NEW
router.patch ('/users/:id',            authenticate, requireAdmin, userCtrl.updateUser);
router.delete('/users/:id',            authenticate, requireSuperAdmin, userCtrl.deleteUser);

// ── Admins ────────────────────────────────────────────────────
router.get('/admins', authenticate, requireSuperAdmin, userCtrl.listAdmins);

// ── Image Upload ──────────────────────────────────────────────
router.post  ('/upload/image',             authenticate, requireAdmin, upload.single('image'), upCtrl.uploadImage);
router.delete('/upload/image/:publicId',   authenticate, requireAdmin, upCtrl.deleteImage);

// ── Batches ───────────────────────────────────────────────────
const batchCtrl = require('../controllers/batches');
router.get  ('/batches',                  authenticate, requireAdmin, batchCtrl.listBatches);
router.post ('/batches',                  authenticate, requireAdmin, batchCtrl.createBatch);
router.delete('/batches/:id',             authenticate, requireAdmin, batchCtrl.deleteBatch);
router.post ('/batches/assign',           authenticate, requireAdmin, batchCtrl.assignBatch);
router.post ('/tests/:id/batches',        authenticate, requireAdmin, batchCtrl.mapTestBatches);
router.get  ('/tests/:id/batches',        authenticate, requireAdmin, batchCtrl.getTestBatches);

// ── Resume test (admin) ───────────────────────────────────────
router.post('/submissions/resume/:id',    authenticate, requireAdmin, subCtrl.resumeTest);

// ── Question Bank ─────────────────────────────────────────────
const bankCtrl = require('../controllers/questionBank');
router.get   ('/question-bank',           authenticate, requireAdmin, bankCtrl.listBank);
router.post  ('/question-bank',           authenticate, requireAdmin, bankCtrl.createBank);
router.post  ('/question-bank/import',    authenticate, requireAdmin, bankCtrl.bulkImportBank);
router.delete('/question-bank/:id',       authenticate, requireAdmin, bankCtrl.deleteBank);
router.post('/question-bank/import-csv',  authenticate, requireAdmin, bankCtrl.importCsv);

// ── Email ─────────────────────────────────────────────────
const emailCtrl = require('../controllers/email');
router.post('/email/send', authenticate, requireAdmin, emailLimiter, validate(sendEmailSchema), emailCtrl.sendBulkEmail);

// ── Health check ──────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

module.exports = router;
