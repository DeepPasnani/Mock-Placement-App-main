import Docker from 'dockerode';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

class ContainerPool {
  constructor() {
    this.docker = new Docker({ socketPath: config.docker.socketPath });
    this.pool = new Map();
    this.maxPoolSize = 10;
  }

  async acquire(language) {
    const key = language.image;
    if (!this.pool.has(key)) {
      this.pool.set(key, []);
    }
    const available = this.pool.get(key);
    if (available.length > 0) {
      return available.pop();
    }
    return null;
  }

  async release(language, container) {
    const key = language.image;
    if (!this.pool.has(key)) {
      this.pool.set(key, []);
    }
    const available = this.pool.get(key);
    if (available.length < this.maxPoolSize) {
      available.push(container);
    } else {
      try {
        await container.stop({ t: 1 }).catch(() => {});
        await container.remove({ force: true });
      } catch (err) {
        logger.warn({ err }, 'Failed to cleanup container from pool');
      }
    }
  }

  async drain() {
    for (const [, containers] of this.pool) {
      for (const container of containers) {
        try {
          await container.stop({ t: 1 }).catch(() => {});
          await container.remove({ force: true });
        } catch (err) {
          logger.warn({ err }, 'Failed to cleanup container during drain');
        }
      }
    }
    this.pool.clear();
  }
}

export default ContainerPool;
