const { getRedis } = require('../db/redis');
const logger = require('../services/logger');

// ── Shared rate-limit store (Redis) ──────────────────────────────
// express-rate-limit's default store is an in-process Map. That's fine
// with exactly one backend container, but as soon as you run more than
// one replica (see docker-compose.lb.yml / docker-compose.blue-green.yml)
// each replica keeps its OWN counters. Nginx round-robins requests across
// replicas, so a single email/IP's hits get split across N independent
// buckets — the configured "max" is effectively multiplied by however
// many replicas happen to serve that client, and which replica serves
// which request isn't something a client controls or you can predict.
//
// This implements the Store interface express-rate-limit v7 expects
// (init/increment/decrement/resetKey) backed by a Redis INCR + EXPIRE,
// so every replica shares one counter per key.
//
// Fails OPEN on Redis errors (logs + allows the request) rather than
// taking the whole API down if Redis has a hiccup — consistent with how
// the rest of the app treats Redis as "recommended, not required"
// (see health check / cache helpers).
class RedisRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.windowMs = 60_000; // overwritten by init()
  }

  init(options) {
    if (options?.windowMs) this.windowMs = options.windowMs;
  }

  async increment(key) {
    const redisKey = `ratelimit:${this.prefix}:${key}`;
    try {
      const redis = await getRedis();
      const windowSeconds = Math.ceil(this.windowMs / 1000);
      const totalHits = await redis.incr(redisKey);
      if (totalHits === 1) {
        await redis.expire(redisKey, windowSeconds);
      }
      const ttl = await redis.ttl(redisKey);
      const resetTime = new Date(Date.now() + Math.max(ttl, 0) * 1000);
      return { totalHits, resetTime };
    } catch (err) {
      logger.warn({ err, redisKey }, 'Rate limit store unavailable, failing open for this request');
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key) {
    const redisKey = `ratelimit:${this.prefix}:${key}`;
    try {
      const redis = await getRedis();
      const val = await redis.decr(redisKey);
      if (val <= 0) await redis.del(redisKey);
    } catch (err) {
      logger.warn({ err, redisKey }, 'Rate limit decrement failed');
    }
  }

  async resetKey(key) {
    const redisKey = `ratelimit:${this.prefix}:${key}`;
    try {
      const redis = await getRedis();
      await redis.del(redisKey);
    } catch (err) {
      logger.warn({ err, redisKey }, 'Rate limit reset failed');
    }
  }
}

module.exports = RedisRateLimitStore;
