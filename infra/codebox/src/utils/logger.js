import pino from 'pino';
import config from './config.js';

const logger = pino({
  name: 'codebox',
  level: config.server.nodeEnv === 'production' ? 'info' : 'debug',
  transport: config.server.nodeEnv !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
  } : undefined,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

export default logger;
