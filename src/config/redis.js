const { Redis } = require('ioredis');
const env = require('./env');
const logger = require('./logger');

let client = null;

/**
 * Shared Redis client. Returns null when REDIS_URL is not set, so every
 * caller must have an in-process fallback.
 */
function getRedis() {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    client.on('error', (err) => logger.error({ err }, 'Redis error'));
  }
  return client;
}

async function closeRedis() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}

module.exports = { getRedis, closeRedis };
