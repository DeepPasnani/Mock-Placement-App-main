const pino = require('pino');

const logger = pino({
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  level: process.env.LOG_LEVEL || 'info',
});

module.exports = logger;
