require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const pinoHttp = require('pino-http');

const routes = require('./routes');
const { setupWebSocket } = require('./services/websocket');
const logger = require('./services/logger');
const { pool } = require('./db');
const { getRedis } = require('./db/redis');

const app = express();
const PORT = process.env.PORT || 5000;

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

// ── Routes ──────────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check ───────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks = { database: false, redis: false };

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

  const allOk = checks.database && checks.redis;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
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
});
