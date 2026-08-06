import config from '../utils/config.js';
import DockerExecutor from './DockerExecutor.js';
import logger from '../utils/logger.js';

let executorInstance = null;

export function getExecutorType() {
  return config.executor.type || 'docker';
}

export function getSystemCapabilities() {
  return {
    current: getExecutorType(),
    recommended: 'docker',
    configured: config.executor.type,
    capabilities: {
      docker: true,
      firecracker: false,
    },
    platform: process.platform,
    arch: process.arch,
  };
}

export function createExecutor(type) {
  const executorType = type || config.executor.type;

  switch (executorType) {
    case 'docker':
      return new DockerExecutor();
    default:
      logger.warn({ executorType }, 'Unknown executor type, falling back to Docker');
      return new DockerExecutor();
  }
}

export function getExecutor() {
  if (!executorInstance) {
    executorInstance = createExecutor();
  }
  return executorInstance;
}

export default {
  getExecutor,
  createExecutor,
  getExecutorType,
  getSystemCapabilities,
};
