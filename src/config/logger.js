const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.LOG_LEVEL || (env.isTest ? 'silent' : env.isProduction ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  transport:
    !env.isProduction && !env.isTest
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
});

module.exports = logger;
