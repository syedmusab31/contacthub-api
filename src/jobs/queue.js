/**
 * Small job queue abstraction.
 *
 * - With REDIS_URL set, jobs go through BullMQ: retries with backoff, a
 *   separate worker process can consume them (`npm run worker`), and cron
 *   jobs run exactly once across all instances.
 * - Without Redis, jobs run in-process (inline in tests) and cron jobs use
 *   node-cron. Fine for a single instance / development.
 */
const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');

const QUEUE_NAME = 'contact-manager';
const handlers = new Map();
const cronTasks = [];
let queue = null;
let worker = null;

function redisConnection() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

function getQueue() {
  if (!env.REDIS_URL) return null;
  if (!queue) {
    const { Queue } = require('bullmq');
    queue = new Queue(QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return queue;
}

function register(name, handler) {
  handlers.set(name, handler);
}

async function runLocal(name, data) {
  const handler = handlers.get(name);
  if (!handler) {
    logger.error({ job: name }, 'No handler registered for job');
    return;
  }
  try {
    await handler(data);
  } catch (err) {
    logger.error({ err, job: name }, 'Job failed');
  }
}

/** Fire-and-forget from the caller's point of view; never throws. */
async function enqueue(name, data = {}) {
  const q = getQueue();
  if (q) {
    try {
      await q.add(name, data);
    } catch (err) {
      logger.error({ err, job: name }, 'Failed to enqueue job');
    }
    return;
  }
  if (env.isTest) return runLocal(name, data);
  setImmediate(() => runLocal(name, data));
}

/** Start consuming jobs (only needed when Redis is used). */
function startWorker() {
  if (!env.REDIS_URL || worker) return;
  const { Worker } = require('bullmq');
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const handler = handlers.get(job.name);
      if (!handler) throw new Error(`No handler registered for job "${job.name}"`);
      return handler(job.data);
    },
    { connection: redisConnection(), concurrency: 5 }
  );
  worker.on('failed', (job, err) => logger.error({ err, job: job?.name }, 'Job failed'));
  logger.info('Job worker started');
}

/** Register a recurring job. */
async function schedule(name, pattern) {
  if (!cron.validate(pattern)) throw new Error(`Invalid cron pattern for ${name}: ${pattern}`);
  const q = getQueue();
  if (q) {
    await q.upsertJobScheduler(name, { pattern, tz: env.CRON_TIMEZONE }, { name, data: {} });
  } else {
    cronTasks.push(cron.schedule(pattern, () => runLocal(name, {}), { timezone: env.CRON_TIMEZONE }));
  }
  logger.info({ job: name, pattern }, 'Recurring job scheduled');
}

async function close() {
  cronTasks.splice(0).forEach((t) => t.stop());
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
}

module.exports = { register, enqueue, startWorker, schedule, close, runLocal };
