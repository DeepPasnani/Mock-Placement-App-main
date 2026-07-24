require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const pinoHttp = require('pino-http');
const promClient = require('prom-client');

const routes = require('./routes');
const { setupWebSocket } = require('./services/websocket');
const { startScheduler } = require('./services/scheduler');
const logger = require('./services/logger');
const { pool, getReadPool } = require('./db');
const { getRedis } = require('./db/redis');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Prometheus metrics ────────────────────────────────────
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ register: promClient.register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2.5, 5, 10],
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

const activeUsersGauge = new promClient.Gauge({
  name: 'active_users_total',
  help: 'Number of active users in tests',
});

// ── Swagger ───────────────────────────────────────────────
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'PlacementPro API Docs',
}));

// ── Middleware ──────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(pinoHttp({ logger }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request metrics middleware ────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const path = req.route ? req.route.path : req.path;
    httpRequestDuration.observe({ method: req.method, path, status: res.statusCode }, duration);
    httpRequestsTotal.inc({ method: req.method, path, status: res.statusCode });
  });
  next();
});

// ── Routes ──────────────────────────────────────────────────────
app.use('/api', routes);

// ── Metrics endpoint for Prometheus ───────────────────────
app.get('/metrics', async (_req, res) => {
  try {
    const r = await getRedis();
    const activeKeys = await r.keys('active:*');
    activeUsersGauge.set(activeKeys.length);
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (err) {
    res.status(500).json({ error: 'Metrics unavailable' });
  }
});

// ── Health check ───────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks = { database: false, redis: false, readReplica: false };

  try {
    await pool.query('SELECT 1');
    checks.database = true;
  } catch {
    checks.database = false;
  }

  try {
    const r = await getRedis();
    await r.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  // Check read replica if configured
  const readUrl = process.env.DATABASE_URL_READ;
  if (readUrl) {
    try {
      const rp = getReadPool();
      await rp.query('SELECT 1');
      checks.readReplica = true;
    } catch {
      checks.readReplica = false;
    }
  } else {
    checks.readReplica = 'not_configured';
  }

  const allOk = checks.database && checks.redis;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── 404 handler ────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ──────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// ── Create HTTP server with WebSocket support ──────────────────
const server = http.createServer(app);
setupWebSocket(server);

// ── Start server ───────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'Server started');
  startScheduler();
});
