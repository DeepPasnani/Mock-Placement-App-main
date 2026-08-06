import config from '../../utils/config.js';

const requestCounts = new Map();

export function rateLimitMiddleware(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;
  const maxRequests = config.rateLimit.maxRequests;
  let entry = requestCounts.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 1, windowStart: now };
    requestCounts.set(ip, entry);
    return next();
  }
  entry.count++;
  if (entry.count > maxRequests) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestCounts) {
    if (now - entry.windowStart > config.rateLimit.windowMs * 2) {
      requestCounts.delete(ip);
    }
  }
}, 60000);

export default rateLimitMiddleware;
