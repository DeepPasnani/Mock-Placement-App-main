import { Worker } from 'bullmq';
import Redis from 'ioredis';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { executeCode, compareOutput } from './jobs/executeCode.js';
import { getStatusById } from '../languages/index.js';

let redis = null;
let worker = null;

async function updateSubmissionResult(token, result) {
  await redis.setex(
    `submission:${token}`,
    config.cache.resultTtl,
    JSON.stringify(result)
  );
}

async function sendCallback(callbackUrl, submission) {
  if (!callbackUrl) return;
  try {
    const response = await fetch(callbackUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
    logger.info({
      event: 'callback_sent',
      token: submission.token,
      url: callbackUrl,
      status: response.status,
    });
  } catch (error) {
    logger.error({
      event: 'callback_failed',
      token: submission.token,
      url: callbackUrl,
      error: error.message,
    });
  }
}

async function processJob(job) {
  const submission = job.data;
  const token = submission.token;

  logger.info({
    event: 'job_started',
    token,
    jobId: job.id,
  });

  await updateSubmissionResult(token, {
    ...submission,
    status: getStatusById(2),
  });

  let result = await executeCode(submission);

  if (submission.expected_output && result.status.id === 3) {
    const matches = compareOutput(result.stdout, submission.expected_output);
    if (matches === false) {
      result.status = getStatusById(4);
    }
  }

  await updateSubmissionResult(token, {
    ...submission,
    ...result,
    finished_at: new Date().toISOString(),
  });

  if (submission.callback_url) {
    await sendCallback(submission.callback_url, result);
  }

  logger.info({
    event: 'job_completed',
    token,
    jobId: job.id,
    status: result.status.id,
  });

  return result;
}

export async function startWorker() {
  redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
  });

  redis.on('error', (err) => {
    logger.error({ err }, 'Worker Redis connection error');
  });

  worker = new Worker('submissions', processJob, {
    connection: redis,
    concurrency: config.worker.concurrency,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 1000 },
  });

  worker.on('completed', (job, result) => {
    logger.debug({
      event: 'worker_job_completed',
      jobId: job.id,
      token: job.data.token,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error({
      event: 'worker_job_failed',
      jobId: job?.id,
      token: job?.data?.token,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  logger.info({
    event: 'worker_started',
    concurrency: config.worker.concurrency,
  });

  return worker;
}

export async function stopWorker() {
  if (worker) {
    await worker.close();
    logger.info('Worker stopped');
  }
  if (redis) {
    await redis.quit();
  }
}

if (process.argv[1].endsWith('worker.js')) {
  startWorker().catch((err) => {
    logger.error({ err }, 'Failed to start worker');
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await stopWorker();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await stopWorker();
    process.exit(0);
  });
}

export default {
  startWorker,
  stopWorker,
};
