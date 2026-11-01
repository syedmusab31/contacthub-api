const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const env = require('../config/env');
const { getRedis } = require('../config/redis');
const AppError = require('../utils/AppError');

/** Use Redis when available so limits are shared across instances. */
function buildStore(prefix) {
  const redis = getRedis();
  if (!redis) return undefined;
  return new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (...args) => redis.call(...args) });
}

function limiter(prefix, max) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: buildStore(prefix),
    skip: () => env.isTest,
    handler: (req, res, next) =>
      next(new AppError('Too many requests, please try again later', 429, 'TOO_MANY_REQUESTS')),
  });
}

module.exports = {
  apiLimiter: limiter('api', env.RATE_LIMIT_MAX),
  authLimiter: limiter('auth', env.AUTH_RATE_LIMIT_MAX),
};
