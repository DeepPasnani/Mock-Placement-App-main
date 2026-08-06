import config from '../../utils/config.js';

export function authMiddleware(req, res, next) {
  if (config.auth.tokens.length === 0) {
    return next();
  }
  let token = null;
  for (const header of config.auth.headers) {
    token = req.get(header);
    if (token) break;
  }
  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Missing authentication header',
    });
  }
  if (!config.auth.tokens.includes(token)) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid authentication token',
    });
  }
  next();
}

export default authMiddleware;
