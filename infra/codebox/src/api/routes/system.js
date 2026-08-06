import { Router } from 'express';
import os from 'os';
import { getAllStatuses } from '../../languages/index.js';
import { getQueueStats, getWorkerStats } from '../../queue/producer.js';
import config from '../../utils/config.js';

const router = Router();
const startTime = Date.now();

router.get('/statuses', (req, res) => {
  res.json(getAllStatuses());
});

router.get('/about', (req, res) => {
  res.json({
    version: '1.0.0',
    homepage: 'https://github.com/chaicode/codebox',
    source_code: 'https://github.com/chaicode/codebox',
    maintainer: 'CodeBox Team',
  });
});

router.get('/workers', async (req, res) => {
  try {
    const workers = await getWorkerStats();
    res.json(workers);
  } catch {
    res.json([]);
  }
});

router.get('/system_info', async (req, res) => {
  const cpus = os.cpus();
  res.json({
    system: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
    },
    cpu: {
      model: cpus[0]?.model,
      cores: cpus.length,
      speed: cpus[0]?.speed,
    },
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
    },
    uptime: {
      system: os.uptime(),
      process: process.uptime(),
    },
    load: os.loadavg(),
  });
});

router.get('/config_info', (req, res) => {
  res.json({
    max_cpu_time_limit: config.execution.maxCpuTimeLimit,
    max_cpu_extra_time: 5,
    max_wall_time_limit: config.execution.maxWallTimeLimit,
    max_memory_limit: config.execution.maxMemoryLimit,
    max_stack_limit: config.execution.defaultStackLimit,
    max_max_processes_and_or_threads: config.execution.maxProcesses,
    cpu_time_limit: config.execution.defaultCpuTimeLimit,
    cpu_extra_time: 1,
    wall_time_limit: config.execution.defaultWallTimeLimit,
    memory_limit: config.execution.defaultMemoryLimit,
    stack_limit: config.execution.defaultStackLimit,
    max_processes_and_or_threads: config.execution.maxProcesses,
    enable_network: false,
    enable_per_process_and_thread_time_limit: false,
    enable_per_process_and_thread_memory_limit: false,
    allow_enable_network: false,
  });
});

router.get('/statistics', async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch {
    res.json({
      submissions: { total: 0, in_queue: 0, processing: 0, completed: 0 },
    });
  }
});

export default router;
