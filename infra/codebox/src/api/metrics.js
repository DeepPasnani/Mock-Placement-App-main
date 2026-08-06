import promClient from 'prom-client';

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

const submissionsCounter = new promClient.Counter({
  name: 'codebox_submissions_total',
  help: 'Total number of code submissions',
  labelNames: ['language_id', 'status'],
  registers: [register],
});

const queueDepthGauge = new promClient.Gauge({
  name: 'codebox_queue_depth',
  help: 'Current number of submissions in queue',
  registers: [register],
});

export function trackRequest(method, route, status, duration) {
  httpRequestCounter.labels(method, route, status).inc();
  httpRequestDuration.labels(method, route, status).observe(duration);
}

export function trackSubmission(languageId, status) {
  submissionsCounter.labels(String(languageId), String(status)).inc();
}

export function setQueueDepth(depth) {
  queueDepthGauge.set(depth);
}

export async function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

export default {
  trackRequest,
  trackSubmission,
  setQueueDepth,
  metricsHandler,
};
