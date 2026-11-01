const { Router } = require('express');
const { isDatabaseReady } = require('../../config/db');
const { getRedis } = require('../../config/redis');

const router = Router();

/** Liveness: the process is up. */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

/** Readiness: dependencies are reachable, so the instance can take traffic. */
router.get('/ready', async (req, res) => {
  const checks = { database: isDatabaseReady() ? 'up' : 'down' };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    }
  }

  const ready = Object.values(checks).every((v) => v === 'up');
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
});

module.exports = router;
