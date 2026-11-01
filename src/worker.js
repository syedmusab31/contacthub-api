/**
 * Standalone job worker. Only useful when REDIS_URL is set; without Redis,
 * jobs run inside the API process.
 */
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { closeRedis } = require('./config/redis');
const { queue } = require('./jobs');

async function start() {
  if (!env.REDIS_URL) {
    logger.error('REDIS_URL is not set; jobs run inside the API process, no worker needed');
    process.exit(1);
  }
  await connectDatabase();
  queue.startWorker();

  const shutdown = async () => {
    await queue.close();
    await closeRedis();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
