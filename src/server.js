const env = require('./config/env');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { closeRedis } = require('./config/redis');
const createApp = require('./app');
const { queue, startScheduler } = require('./jobs');

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function start() {
  // Connect first so the API never accepts requests it cannot serve.
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // With Redis, run `npm run worker` separately to scale workers on their own.
  // Set RUN_WORKER_IN_API=false to stop this process from consuming jobs.
  if (env.RUN_WORKER_IN_API) queue.startWorker();
  await startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    const timer = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    server.close(async () => {
      await queue.close();
      await closeRedis();
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'Unhandled promise rejection');
  process.exit(1);
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
