import logger from '../../utils/logger.js';

export function errorHandler(err, req, res, next) {
  logger.error({
    event: 'unhandled_error',
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack,
  });

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request body exceeds the maximum allowed size',
    });
  }

  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`,
  });
}

export default { errorHandler, notFoundHandler };
