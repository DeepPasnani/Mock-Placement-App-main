import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { metricsHandler } from './metrics.js';
import routes from './routes/index.js';

const app = express();

app.use(helmet());
app.use(cors());

app.use(express.json({ limit: config.server.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.server.bodyLimit }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
    });
  });
  next();
});

app.use(rateLimitMiddleware);

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', metricsHandler);

app.use(authMiddleware);

app.use('/', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export function startServer() {
  const port = config.server.port;
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info(`Server started on port ${port}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
      resolve(server);
    });
  });
}

export default app;
