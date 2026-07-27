const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const { detectTenant } = require('../middleware/tenant');
const rawBody = express.raw({ type: 'application/json' });
const { apiLimiter, authLimiter, codeLimiter, bulkImportLimiter, emailLimiter } = require('../middleware/rateLimit');

router.use(apiLimiter);
router.use(detectTenant);

const { upload } = require('../services/cloudinary');
const { validate, bulkImportSchema, createTestSchema, submitTestSchema, sendEmailSchema } = require('../middleware/validate');

const authCtrl = require('../controllers/auth');
const testCtrl = require('../controllers/tests');
const subCtrl  = require('../controllers/submissions');
const userCtrl = require('../controllers/users');
const upCtrl   = require('../controllers/upload');
const procCtrl = require('../controllers/proctoring');
const shuffleCtrl = require('../controllers/shuffle');
const securityCtrl = require('../controllers/security');

router.post('/auth/login',            authLimiter, authCtrl.login);
router.post('/auth/register',         authLimiter, authCtrl.register);
router.post('/auth/google',           authLimiter, authCtrl.googleLogin);
router.post('/auth/logout',           authenticate, authCtrl.logout);
router.get ('/auth/me',               authenticate, authCtrl.getMe);
router.post('/auth/change-password',  authenticate, authCtrl.changePassword);
router.post('/auth/forgot-password',  authLimiter,  authCtrl.forgotPassword);
router.post('/auth/reset-password',   authLimiter,  authCtrl.resetPassword);

// ── Tests ─────────────────────────────────────────────────────
router.get   ('/tests',                   authenticate, testCtrl.listTests);
router.get   ('/tests/:id',               authenticate, testCtrl.getTest);
router.post  ('/tests',                   authenticate, requireAdmin, validate(createTestSchema), testCtrl.createTest);
router.put   ('/tests/:id',               authenticate, requireAdmin, validate(createTestSchema), testCtrl.updateTest);
router.delete('/tests/:id',               authenticate, requireAdmin, testCtrl.deleteTest);
router.post  ('/tests/:id/duplicate',     authenticate, requireAdmin, testCtrl.duplicateTest);
router.put   ('/tests/:id/schedule',      authenticate, requireAdmin, testCtrl.schedulePublish);

// ── Submissions ───────────────────────────────────────────────
router.post('/submissions/start',          authenticate, subCtrl.startTest);
router.post('/submissions/save',           authenticate, subCtrl.saveAnswers);
router.post('/submissions/submit',         authenticate, validate(submitTestSchema), subCtrl.submitTest);
router.post('/submissions/run-code',       authenticate, codeLimiter, subCtrl.runCode);
// NOTE: these four were previously missing — submitFingerprint, verifyFingerprint,
// logFullscreenViolation, and getTimeBombStatus all already existed fully
// implemented in controllers/submissions.js (schema columns/tables already in
// migrate.js too) but were never wired to a route, so the anti-cheating
// fingerprint check, fullscreen-exit logging, and question time-bomb UI all
// silently 404'd.
router.post('/submissions/fingerprint',        authenticate, subCtrl.submitFingerprint);
router.post('/submissions/fingerprint/verify', authenticate, subCtrl.verifyFingerprint);
router.post('/submissions/fullscreen-violation', authenticate, subCtrl.logFullscreenViolation);
router.get ('/submissions/time-bomb-status',   authenticate, subCtrl.getTimeBombStatus);
router.get ('/submissions/my',             authenticate, subCtrl.getMySubmissions);
router.get ('/submissions/test/:testId',   authenticate, requireAdmin, subCtrl.getTestSubmissions);
router.get ('/submissions/test/:testId/export-pdf', authenticate, requireAdmin, subCtrl.exportResultsPdf);
router.get ('/submissions/test/:testId/export-csv', authenticate, requireAdmin, subCtrl.exportResultsCsv);
router.delete('/submissions/:id',          authenticate, requireAdmin, subCtrl.deleteSubmission);
router.get ('/submissions/question-analytics', authenticate, requireAdmin, subCtrl.getQuestionAnalytics);
router.get ('/submissions/plagiarism-check/:testId', authenticate, requireAdmin, subCtrl.checkPlagiarism);
router.get ('/submissions/:id',            authenticate, subCtrl.getSubmission);

// ── Users ─────────────────────────────────────────────────────
router.get   ('/users',                authenticate, requireAdmin, userCtrl.listUsers);
router.get   ('/users/stats',          authenticate, requireAdmin, userCtrl.getStats);
router.post  ('/users/admin',          authenticate, requireSuperAdmin, userCtrl.createAdmin);
router.post  ('/users/bulk-import',    authenticate, requireAdmin, bulkImportLimiter, validate(bulkImportSchema), userCtrl.bulkImport);
router.post  ('/users/bulk-update-batch', authenticate, requireAdmin, userCtrl.bulkUpdateBatch);
// NOTE: sendResults already existed fully implemented in controllers/users.js
// but was never routed — the admin "email results to students" action 404'd.
router.post  ('/users/send-results',      authenticate, requireAdmin, userCtrl.sendResults);
router.post  ('/users/notify-test',    authenticate, requireAdmin, userCtrl.notifyTestScheduled);
router.get   ('/users/:id/analytics',  authenticate, requireAdmin, userCtrl.getStudentAnalytics);
router.patch ('/users/:id',            authenticate, requireAdmin, userCtrl.updateUser);
router.delete('/users/:id',            authenticate, requireSuperAdmin, userCtrl.deleteUser);
router.put   ('/users/preferences/language', authenticate, userCtrl.updateLanguage);

// ── Admins ────────────────────────────────────────────────────
router.get('/admins', authenticate, requireSuperAdmin, userCtrl.listAdmins);

// ── Image Upload ──────────────────────────────────────────────
router.post  ('/upload/image',             authenticate, requireAdmin, upload.single('image'), upCtrl.uploadImage);
router.delete('/upload/image/:publicId',   authenticate, requireAdmin, upCtrl.deleteImage);

// Serves images stored as bytea in Postgres. Deliberately unauthenticated
// (same as the old static /uploads route) so <img src="/api/images/:id">
// works directly in the browser for admins and students alike, on both the
// test-builder page and the student's test-taking page.
router.get   ('/images/:id',               upCtrl.getImage);

// ── Batches ───────────────────────────────────────────────────
const batchCtrl = require('../controllers/batches');
// Read-only and not sensitive (just name/department/year) — left open to any
// authenticated user because the student Leaderboard page's batch filter
// calls this too; students were previously getting a 403 here.
router.get  ('/batches',                  authenticate, batchCtrl.listBatches);
router.post ('/batches',                  authenticate, requireAdmin, batchCtrl.createBatch);
router.delete('/batches/:id',             authenticate, requireAdmin, batchCtrl.deleteBatch);
router.post ('/batches/assign',           authenticate, requireAdmin, batchCtrl.assignBatch);
router.post ('/tests/:id/batches',        authenticate, requireAdmin, batchCtrl.mapTestBatches);
router.get  ('/tests/:id/batches',        authenticate, requireAdmin, batchCtrl.getTestBatches);

router.post('/submissions/resume/:id',    authenticate, requireAdmin, subCtrl.resumeTest);

// ── Question Bank ─────────────────────────────────────────────
const bankCtrl = require('../controllers/questionBank');
router.get   ('/question-bank',           authenticate, requireAdmin, bankCtrl.listBank);
router.post  ('/question-bank',           authenticate, requireAdmin, bankCtrl.createBank);
router.post  ('/question-bank/import',    authenticate, requireAdmin, bankCtrl.bulkImportBank);
router.delete('/question-bank/:id',       authenticate, requireAdmin, bankCtrl.deleteBank);
router.post('/question-bank/import-csv',  authenticate, requireAdmin, bankCtrl.importCsv);
router.post('/question-bank/import-json', authenticate, requireAdmin, bankCtrl.importJson);

// ── Drives ────────────────────────────────────────────────
const driveCtrl = require('../controllers/drives');
router.get   ('/drives',                    authenticate, requireAdmin, driveCtrl.listDrives);
router.get   ('/drives/:id',                authenticate, requireAdmin, driveCtrl.getDrive);
router.post  ('/drives',                    authenticate, requireAdmin, driveCtrl.createDrive);
router.put   ('/drives/:id',                authenticate, requireAdmin, driveCtrl.updateDrive);
router.delete('/drives/:id',                authenticate, requireAdmin, driveCtrl.deleteDrive);
router.post  ('/drives/:id/tests',          authenticate, requireAdmin, driveCtrl.addTestToDrive);
router.delete('/drives/:id/tests/:testId',  authenticate, requireAdmin, driveCtrl.removeTestFromDrive);
router.post  ('/drives/:id/batches',        authenticate, requireAdmin, driveCtrl.addBatchToDrive);
router.delete('/drives/:id/batches/:batchId', authenticate, requireAdmin, driveCtrl.removeBatchFromDrive);
router.get   ('/drives/:id/stats',          authenticate, requireAdmin, driveCtrl.getDriveStats);

// ── Email ─────────────────────────────────────────────────
const emailCtrl = require('../controllers/email');
router.post('/email/send', authenticate, requireAdmin, emailLimiter, validate(sendEmailSchema), emailCtrl.sendBulkEmail);
// NOTE: sendTestReminder already existed fully implemented in
// controllers/email.js but was never routed — the admin "remind students"
// button on a scheduled test 404'd.
router.post('/email/test-reminder/:testId', authenticate, requireAdmin, emailLimiter, emailCtrl.sendTestReminder);

// ── Gamification ──────────────────────────────────────────
const gamifyCtrl = require('../controllers/gamification');
router.post('/gamification/award-xp',               authenticate, requireAdmin, gamifyCtrl.awardXpHandler);
router.get ('/gamification/my-stats',               authenticate, gamifyCtrl.getMyStats);
router.get ('/gamification/leaderboard',            authenticate, gamifyCtrl.getLeaderboard);
router.get ('/gamification/levels',                 authenticate, gamifyCtrl.getLevels);
router.get ('/gamification/achievements',           authenticate, gamifyCtrl.getAchievements);
router.get ('/gamification/achievements/wall/:userId', authenticate, gamifyCtrl.getAchievementWall);
router.post('/gamification/checkin',                authenticate, gamifyCtrl.checkin);
router.get ('/gamification/streak',                 authenticate, gamifyCtrl.getStreak);
router.get ('/gamification/heatmap',                authenticate, gamifyCtrl.getHeatmap);
router.get ('/gamification/daily-challenge',        authenticate, gamifyCtrl.getDailyChallenge);
router.post('/gamification/daily-challenge/submit', authenticate, gamifyCtrl.submitDailyChallenge);
router.get   ('/gamification/resources',            authenticate, gamifyCtrl.listStudyResources);
router.post  ('/gamification/resources',            authenticate, requireAdmin, gamifyCtrl.createStudyResource);
router.put   ('/gamification/resources/:id',        authenticate, requireAdmin, gamifyCtrl.updateStudyResource);
router.delete('/gamification/resources/:id',        authenticate, requireAdmin, gamifyCtrl.deleteStudyResource);
router.post  ('/gamification/resources/:id/complete', authenticate, gamifyCtrl.completeStudyResource);
router.get   ('/gamification/resources/stats',      authenticate, gamifyCtrl.getResourceStats);
router.post('/gamification/mock-interview/start',    authenticate, gamifyCtrl.startMockInterview);
router.post('/gamification/mock-interview/answer',   authenticate, gamifyCtrl.submitMockInterviewAnswer);
router.post('/gamification/mock-interview/complete', authenticate, gamifyCtrl.completeMockInterview);

// ── Analytics & Reporting ──────────────────────────────────
// NOTE: this whole block was previously missing — the controller functions
// all existed in controllers/analytics.js but were never wired to a route,
// so every one of these calls 404'd with "Not found" in the UI.
const analyticsCtrl = require('../controllers/analytics');
router.get   ('/analytics/cohort',                       authenticate, requireAdmin, analyticsCtrl.getCohortAnalytics);
router.get   ('/analytics/cohort/radar',                 authenticate, requireAdmin, analyticsCtrl.getCohortRadar);
router.get   ('/analytics/cohort/distribution',          authenticate, requireAdmin, analyticsCtrl.getCohortDistribution);
router.get   ('/analytics/student-growth/:userId',       authenticate, requireAdmin, analyticsCtrl.getStudentGrowth);
router.get   ('/analytics/question-metrics/:testId',     authenticate, requireAdmin, analyticsCtrl.getQuestionMetrics);
router.get   ('/analytics/time-sink/:testId',            authenticate, requireAdmin, analyticsCtrl.getTimeSinkAnalysis);
router.get   ('/analytics/placement-probability',        authenticate, requireAdmin, analyticsCtrl.getPlacementProbabilityBatch);
router.get   ('/analytics/placement-probability/:userId', authenticate, requireAdmin, analyticsCtrl.getPlacementProbabilityStudent);
router.post  ('/analytics/report-builder',               authenticate, requireAdmin, analyticsCtrl.reportBuilder);
router.get   ('/analytics/scheduled-reports',            authenticate, requireAdmin, analyticsCtrl.listScheduledReports);
router.post  ('/analytics/scheduled-reports',            authenticate, requireAdmin, analyticsCtrl.createScheduledReport);
router.put   ('/analytics/scheduled-reports/:id',        authenticate, requireAdmin, analyticsCtrl.updateScheduledReport);
router.delete('/analytics/scheduled-reports/:id',        authenticate, requireAdmin, analyticsCtrl.deleteScheduledReport);
router.get   ('/analytics/threshold-alerts',             authenticate, requireAdmin, analyticsCtrl.listThresholdAlerts);
router.post  ('/analytics/threshold-alert',              authenticate, requireAdmin, analyticsCtrl.createThresholdAlert);
router.put   ('/analytics/threshold-alert/:id',          authenticate, requireAdmin, analyticsCtrl.updateThresholdAlert);
router.delete('/analytics/threshold-alert/:id',          authenticate, requireAdmin, analyticsCtrl.deleteThresholdAlert);
router.get   ('/analytics/nl-summary/:testId',           authenticate, requireAdmin, analyticsCtrl.getNLSummary);

// ── AI Features ───────────────────────────────────────────
const aiCtrl = require('../controllers/ai');
const multer = require('multer');
const aiUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post  ('/ai/generate-mcqs',           authenticate, requireAdmin, aiUpload.single('pdf'), aiCtrl.generateMCQs);
router.post  ('/ai/save-generated-mcqs',     authenticate, requireAdmin, aiCtrl.saveGeneratedMCQs);
router.post  ('/ai/coding-hint',             authenticate, aiCtrl.generateCodingHints);
router.post  ('/ai/adaptive-next',           authenticate, aiCtrl.adaptiveDifficulty);
router.post  ('/ai/auto-tag',                authenticate, requireAdmin, aiCtrl.autoTagQuestions);
router.post  ('/ai/auto-tag-batch',          authenticate, requireAdmin, aiCtrl.autoTagBatch);
router.post  ('/ai/performance-feedback',    authenticate, aiCtrl.generateFeedback);
router.get   ('/ai/placement-prediction/:userId', authenticate, requireAdmin, aiCtrl.getPlacementPrediction);
router.get   ('/ai/placement-predictions/batch/:batchId', authenticate, requireAdmin, aiCtrl.getBatchPredictions);
router.post  ('/ai/nl-query',                authenticate, requireAdmin, aiCtrl.naturalLanguageQueryHandler);
router.post  ('/submissions/log-keystroke',  authenticate, aiCtrl.logKeystroke);
router.get   ('/submissions/cheating-analysis/:testId', authenticate, requireAdmin, aiCtrl.getCheatingAnalysis);
router.get   ('/submissions/cheating-flags/:testId', authenticate, requireAdmin, aiCtrl.getStoredCheatingFlags);

// ── Proctoring ────────────────────────────────────────────────
router.post('/proctoring/snapshot',            authenticate, procCtrl.uploadSnapshot);
router.post('/proctoring/heartbeat',           authenticate, procCtrl.heartbeat);
router.get ('/proctoring/flags/:submissionId', authenticate, procCtrl.getFlags);
router.get ('/proctoring/sessions/:testId',    authenticate, requireAdmin, procCtrl.getSessions);

// ── Question Shuffling ───────────────────────────────────────
router.post('/tests/:id/assign-shuffle', authenticate, shuffleCtrl.assignShuffle);
router.get ('/tests/:id/shuffle',         authenticate, shuffleCtrl.getShuffle);

// ── Security ─────────────────────────────────────────────────
router.get ('/admin/security/alerts',         authenticate, requireAdmin, securityCtrl.getSecurityAlerts);
router.get ('/admin/security/alerts/stats',   authenticate, requireAdmin, securityCtrl.getSecurityStats);
router.post('/admin/security/alerts/:id/review',      authenticate, requireAdmin, securityCtrl.reviewAlert);
router.post('/admin/security/disqualify/:submissionId', authenticate, requireAdmin, securityCtrl.disqualifySubmission);
router.get ('/admin/security/sessions/:submissionId',  authenticate, requireAdmin, securityCtrl.getSessionDetails);

// ═══════════════════════════════════════════════════════════════
// FEATURE 1 & 2: TENANT MANAGEMENT & WHITE-LABEL BRANDING
// ═══════════════════════════════════════════════════════════════
const tenantCtrl = require('../controllers/tenants');
router.post  ('/tenants',           authenticate, requireSuperAdmin, tenantCtrl.createTenant);
router.get   ('/tenants',           authenticate, requireSuperAdmin, tenantCtrl.listTenants);
router.get   ('/tenants/:id',       authenticate, tenantCtrl.getTenant);
router.put   ('/tenants/:id',       authenticate, requireSuperAdmin, tenantCtrl.updateTenant);
router.delete('/tenants/:id',       authenticate, requireSuperAdmin, tenantCtrl.deleteTenant);

// FEATURE 3: CUSTOM DOMAINS
router.post('/tenants/:id/verify-domain', authenticate, requireSuperAdmin, tenantCtrl.verifyDomain);

// FEATURE 7: USAGE QUOTAS
router.get  ('/tenants/:id/usage',  authenticate, tenantCtrl.getTenantUsage);
router.get  ('/tenants/:id/quotas', authenticate, requireSuperAdmin, tenantCtrl.getTenantQuotas);
router.put  ('/tenants/:id/quotas', authenticate, requireSuperAdmin, tenantCtrl.setTenantQuotas);
router.post ('/usage/record',       authenticate, requireAdmin, tenantCtrl.recordUsage);

// ═══════════════════════════════════════════════════════════════
// FEATURE 4: RBAC ROLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
const roleCtrl = require('../controllers/roles');
router.get   ('/roles',              authenticate, requireSuperAdmin, roleCtrl.listRoles);
router.post  ('/roles',              authenticate, requireSuperAdmin, roleCtrl.createRole);
router.put   ('/roles/:id',          authenticate, requireSuperAdmin, roleCtrl.updateRole);
router.delete('/roles/:id',          authenticate, requireSuperAdmin, roleCtrl.deleteRole);
router.post  ('/users/assign-role',  authenticate, requireSuperAdmin, roleCtrl.assignUserRole);
router.delete('/users/:userId/roles/:roleId', authenticate, requireSuperAdmin, roleCtrl.removeUserRole);
router.get   ('/users/:userId/roles', authenticate, requireAdmin, roleCtrl.getUserRoles);

// ═══════════════════════════════════════════════════════════════
// FEATURE 5: PROCTOR DASHBOARD
// ═══════════════════════════════════════════════════════════════
const proctorCtrl = require('../controllers/proctor');
router.get  ('/proctor/sessions',              authenticate, checkPermission('proctor:view-sessions'), proctorCtrl.getLiveSessions);
router.post ('/proctor/terminate/:submissionId', authenticate, checkPermission('proctor:terminate'), proctorCtrl.terminateSession);
router.get  ('/proctor/reports/attendance/:testId', authenticate, checkPermission('proctor:attendance'), proctorCtrl.getAttendanceReport);

// ═══════════════════════════════════════════════════════════════
// FEATURE 6: AUDIT LOGS & COMPLIANCE
// ═══════════════════════════════════════════════════════════════
const auditCtrl = require('../controllers/audit');
router.get  ('/audit/logs',    authenticate, checkPermission('audit:view'), auditCtrl.getAuditLogs);
router.get  ('/audit/export',  authenticate, checkPermission('audit:export'), auditCtrl.exportAuditLogs);

// ═══════════════════════════════════════════════════════════════
// FEATURE 15: QUESTION COLLABORATION & APPROVAL WORKFLOW
// ═══════════════════════════════════════════════════════════════
const collabCtrl = require('../controllers/questionCollab');
router.put  ('/question-bank/:id/status',             authenticate, requireAdmin, collabCtrl.updateQuestionStatus);
router.get  ('/question-bank/review-queue',           authenticate, requireAdmin, collabCtrl.getReviewQueue);
router.post ('/question-bank/:id/submit-review',      authenticate, requireAdmin, collabCtrl.submitReviewFeedback);
router.get  ('/question-bank/:id/versions',           authenticate, requireAdmin, collabCtrl.getVersionHistory);

// FEATURE 16: PARAMETERIZED QUESTIONS
router.post('/questions/generate-variant/:questionId', authenticate, collabCtrl.generateQuestionVariant);

// ═══════════════════════════════════════════════════════════════
// FEATURE 17: BULK OPERATIONS
// ═══════════════════════════════════════════════════════════════
const bulkCtrl = require('../controllers/bulk');
router.post('/tests/bulk-delete',       authenticate, requireAdmin, bulkCtrl.bulkDeleteTests);
router.post('/tests/bulk-archive',      authenticate, requireAdmin, bulkCtrl.bulkArchiveTests);
router.post('/question-bank/bulk-delete', authenticate, requireAdmin, bulkCtrl.bulkDeleteQuestions);
router.post('/users/bulk-delete',       authenticate, requireSuperAdmin, bulkCtrl.bulkDeleteUsers);

// ═══════════════════════════════════════════════════════════════
// FEATURE 18: TEST TEMPLATES
// ═══════════════════════════════════════════════════════════════
const tmplCtrl = require('../controllers/testTemplates');
router.get  ('/test-templates',                    authenticate, requireAdmin, tmplCtrl.listTemplates);
router.post ('/test-templates',                    authenticate, requireAdmin, tmplCtrl.createTemplate);
router.delete('/test-templates/:id',               authenticate, requireAdmin, tmplCtrl.deleteTemplate);
router.post ('/tests/from-template/:templateId',   authenticate, requireAdmin, tmplCtrl.createTestFromTemplate);

// ═══════════════════════════════════════════════════════════════
// FEATURE 20: TWO-FACTOR AUTH
// ═══════════════════════════════════════════════════════════════
const twofaCtrl = require('../controllers/twofa');
router.post ('/auth/2fa/setup',     authenticate, twofaCtrl.setup2FA);
router.post ('/auth/2fa/verify',    authenticate, twofaCtrl.verifyAndEnable2FA);
router.post ('/auth/2fa/disable',   authenticate, twofaCtrl.disable2FA);
router.post ('/auth/2fa/validate',  twofaCtrl.validate2FA);
router.get  ('/auth/2fa/status',    authenticate, twofaCtrl.get2FAStatus);

// ═══════════════════════════════════════════════════════════════
// FEATURE 21: GDPR COMPLIANCE
// ═══════════════════════════════════════════════════════════════
const gdprCtrl = require('../controllers/gdpr');
router.get  ('/gdpr/data/:userId',    authenticate, gdprCtrl.collectUserData);
router.post ('/gdpr/export',          authenticate, gdprCtrl.exportUserData);
router.post ('/gdpr/forget',          authenticate, gdprCtrl.forgetUser);
router.post ('/gdpr/consent',         authenticate, gdprCtrl.updateConsent);
router.get  ('/gdpr/consents',        authenticate, gdprCtrl.getConsents);

// ═══════════════════════════════════════════════════════════════
// FEATURE 22: ADMIN SESSION MANAGER
// ═══════════════════════════════════════════════════════════════
const sessionCtrl = require('../controllers/adminSessions');
router.get  ('/admin/sessions',              authenticate, requireAdmin, sessionCtrl.listActiveSessions);
router.post ('/admin/sessions/:id/revoke',   authenticate, requireAdmin, sessionCtrl.revokeSession);

// ── Health check ──────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ═══════════════════════════════════════════════════════════════
// The following five blocks (code ops, notifications, test messages,
// announcements, forum) were all fully implemented in their respective
// controllers — code_snapshots/code_quality_reports/saved_custom_tests/
// notifications/test_messages/announcements/forum_* tables already exist
// in migrate.js — but none of them were ever wired to a route, so every
// one of these features 404'd from the frontend despite the UI for them
// already existing in frontend/src (student code editor lint/format,
// custom test cases, code playback, IDE workspace, notification bell,
// proctoring chat with admin, admin announcements, and the coding
// discussion forum).
// ═══════════════════════════════════════════════════════════════

// ── Code Ops (lint/format/snapshots/playback/quality/custom tests/IDE) ──
const codeOpsCtrl = require('../controllers/codeOps');
router.post  ('/code/lint',                       authenticate, codeOpsCtrl.lintCode);
router.post  ('/code/format',                     authenticate, codeOpsCtrl.formatCode);
router.post  ('/submissions/code-snapshot',       authenticate, codeOpsCtrl.saveCodeSnapshot);
router.get   ('/submissions/:id/playback',        authenticate, codeOpsCtrl.getPlayback);
router.post  ('/submissions/:id/quality-report',  authenticate, codeOpsCtrl.getQualityReport);
router.post  ('/submissions/run-custom-test',     authenticate, codeLimiter, codeOpsCtrl.runCustomTest);
router.post  ('/submissions/save-custom-test',    authenticate, codeOpsCtrl.saveCustomTest);
router.get   ('/saved-custom-tests/:problemId',   authenticate, codeOpsCtrl.getSavedCustomTests);
router.delete('/saved-custom-tests/:id',          authenticate, codeOpsCtrl.deleteSavedCustomTest);
router.get   ('/coding-problems/:id/workspace',   authenticate, codeOpsCtrl.getWorkspace);
router.post  ('/submissions/save-workspace',      authenticate, requireAdmin, codeOpsCtrl.saveWorkspace);

// ── Notifications ─────────────────────────────────────────────
const notifCtrl = require('../controllers/notifications');
router.get ('/notifications',              authenticate, notifCtrl.listNotifications);
router.put ('/notifications/:id/read',     authenticate, notifCtrl.markAsRead);
router.put ('/notifications/read-all',     authenticate, notifCtrl.markAllRead);
router.get ('/notifications/unread-count', authenticate, notifCtrl.getUnreadCount);
router.post('/notifications/send',         authenticate, requireAdmin, notifCtrl.sendNotificationByAdmin);

// ── Test Messages (student ↔ admin chat during a test) ─────────
const testMsgCtrl = require('../controllers/testMessages');
router.post('/test-messages',              authenticate, testMsgCtrl.sendMessage);
router.get ('/test-messages/my/:testId',   authenticate, testMsgCtrl.getMyMessages);
router.get ('/test-messages/:testId',      authenticate, requireAdmin, testMsgCtrl.getTestMessages);
router.put ('/test-messages/:id/resolve',  authenticate, requireAdmin, testMsgCtrl.resolveMessage);

// ── Announcements ─────────────────────────────────────────────
const announcementCtrl = require('../controllers/announcements');
router.get   ('/announcements',      authenticate, announcementCtrl.listAnnouncements);
router.post  ('/announcements',      authenticate, requireAdmin, announcementCtrl.createAnnouncement);
router.put   ('/announcements/:id',  authenticate, requireAdmin, announcementCtrl.updateAnnouncement);
router.delete('/announcements/:id',  authenticate, requireAdmin, announcementCtrl.deleteAnnouncement);

// ── Forum (per-coding-problem discussion threads) ───────────────
const forumCtrl = require('../controllers/forum');
router.get   ('/forum/problems/:problemId/threads', authenticate, forumCtrl.listThreads);
router.post  ('/forum/threads',                      authenticate, forumCtrl.createThread);
router.get   ('/forum/threads/:id',                  authenticate, forumCtrl.getThread);
router.post  ('/forum/threads/:id/reply',            authenticate, forumCtrl.replyToThread);
router.post  ('/forum/replies/:id/upvote',           authenticate, forumCtrl.upvoteReply);
router.put   ('/forum/replies/:id',                  authenticate, forumCtrl.updateReply);
router.delete('/forum/replies/:id',                  authenticate, forumCtrl.deleteReply);

module.exports = router;
