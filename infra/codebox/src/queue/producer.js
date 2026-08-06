import { Queue } from 'bullmq';
import Redis from 'ioredis';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { setQueueDepth } from '../api/metrics.js';

let redis = null;
let queue = null;

export async function initializeQueue() {
  redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  redis.on('error', (err) => {
    logger.error({ err }, 'Redis connection error');
  });

  queue = new Queue('submissions', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 1000 },
    },
  });

  logger.info('Queue initialized');
  return queue;
}

export async function addSubmission(submission) {
  if (!queue) {
    await initializeQueue();
  }

  await queue.add(submission.token, submission, {
    jobId: submission.token,
  });

  await setQueueDepth(await queue.getWaitingCount());

  return submission;
}

export async function getSubmission(token) {
  if (!redis) {
    return null;
  }

  const data = await redis.get(`submission:${token}`);
  if (data) {
    return JSON.parse(data);
  }

  const job = await queue.getJob(token);
  if (job) {
    const result = job.returnvalue;
    if (result) {
      return result;
    }
  }

  return null;
}

export async function deleteSubmission(token) {
  if (!redis) {
    return false;
  }

  await redis.del(`submission:${token}`);
  const job = await queue.getJob(token);
  if (job) {
    await job.remove();
  }
  return true;
}

export async function getQueueStats() {
  if (!queue) {
    return {
      submissions: { total: 0, in_queue: 0, processing: 0, completed: 0 },
    };
  }

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return {
    submissions: {
      total: waiting + active + completed + failed,
      in_queue: waiting,
      processing: active,
      completed,
      failed,
    },
  };
}

export async function getWorkerStats() {
  if (!queue) return [];
  const workers = await queue.getWorkers();
  return workers.map(w => ({
    name: w.name,
    host: w.host,
    ip: w.ip,
    version: w.version,
    concurrency: w.concurrency,
    last_seen: new Date(w.lastSeen).toISOString(),
  }));
}

export async function closeQueue() {
  if (queue) {
    await queue.close();
  }
  if (redis) {
    await redis.quit();
  }
}

export default {
  initializeQueue,
  addSubmission,
  getSubmission,
  deleteSubmission,
  getQueueStats,
  getWorkerStats,
  closeQueue,
};
