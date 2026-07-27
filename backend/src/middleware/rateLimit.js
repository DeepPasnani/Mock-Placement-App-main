const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// ── Key by authenticated user, not just IP ──────────────────────
// Root cause of the "too many requests" errors students hit mid-exam:
// these limiters previously keyed purely on req.ip (the express-rate-limit
// default). On a campus network, many students behind the same NAT/proxy
// share one public IP, so their requests all landed in the SAME bucket —
// a handful of students taking a test at once could exhaust the limit
// for the whole lab. Keying by the authenticated user id (falling back to
// IP only for unauthenticated requests, e.g. login) isolates each
// student's usage as intended.
//
// apiLimiter runs at the very top of the router, before the `authenticate`
// middleware populates req.user, so we decode the JWT directly here (cheap
// local verification, no DB round-trip) rather than relying on req.user.
// codeLimiter etc. run after `authenticate` on their routes, so req.user
// is already available there and this doubles as a harmless fast path.
function userOrIpKey(req) {
  if (req.user?.id) return req.user.id;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
      if (decoded?.userId) return decoded.userId;
    } catch {
      // invalid/expired token — fall through to IP-based limiting
    }
  }
  return req.ip;
}

// ── General API rate limit ───────────────────────────────────────
// A single student sitting a test generates steady background traffic
// even without touching anything: time-bomb polling (every 5s = ~12
// req/min), proctoring heartbeat (every 10s = ~6/min), autosave (every
// 30s) and fingerprint checks (every 60s) add up to ~20-25 req/min of
// baseline traffic. The previous cap (300 / 15 min ≈ 20/min average)
// left no headroom at all, so long exams routinely tripped this limiter
// through completely normal use. Raised well above that baseline while
// still guarding against real abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict limit for auth endpoints (pre-authentication, so always by IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please wait 15 minutes.' },
});

// ── Code submission limiter ──────────────────────────────────────
// Students iterate quickly while solving a coding question (run single
// case, tweak, run again, then "Run All Visible Tests"). The previous
// cap of 10/min was easy to exhaust within a couple of iterations,
// which silently killed the "Run All Tests" results (the request came
// back 429 and the UI just showed no output). Raised to give realistic
// iteration room, and keyed per-user so one student's usage can't affect
// another's.
const codeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyGenerator: userOrIpKey,
  message: { error: 'Code submission rate limit exceeded. Please wait a few seconds and try again.' },
});

// Strict limit for bulk import (admin misuse prevention)
const bulkImportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: userOrIpKey,
  message: { error: 'Bulk import rate limit exceeded. Maximum 10 imports per hour.' },
});

// Limit for email sending
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: userOrIpKey,
  message: { error: 'Email rate limit exceeded. Maximum 5 sends per hour.' },
});

module.exports = { apiLimiter, authLimiter, codeLimiter, bulkImportLimiter, emailLimiter };
