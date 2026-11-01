const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const YAML = require('yaml');

const env = require('./config/env');
const logger = require('./config/logger');
const sanitize = require('./middleware/sanitize');
const { apiLimiter } = require('./middleware/rateLimiter');
const { metricsMiddleware, metricsHandler } = require('./middleware/metrics');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

// Registers job handlers so services can enqueue work.
require('./jobs');

function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => ['/health', '/ready', '/metrics'].includes(req.url) },
      customLogLevel: (req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    })
  );

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin))
          return cb(null, true);
        cb(new AppError('Origin not allowed by CORS', 403, 'FORBIDDEN'));
      },
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitize);

  if (env.ENABLE_METRICS) {
    app.use(metricsMiddleware);
    app.get('/metrics', metricsHandler);
  }

  app.use(require('./modules/health/health.routes'));

  if (env.STORAGE_DRIVER === 'local') {
    app.use(
      '/uploads',
      express.static(path.resolve(env.UPLOAD_DIR), { maxAge: '7d', index: false, dotfiles: 'deny' })
    );
  }

  if (env.ENABLE_API_DOCS) {
    const swaggerUi = require('swagger-ui-express');
    const spec = YAML.parse(fs.readFileSync(path.join(__dirname, 'docs/openapi.yaml'), 'utf8'));
    app.get('/api/docs.json', (req, res) => res.json(spec));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Contact Manager API' }));
  }

  app.use('/api/v1', apiLimiter, require('./routes'));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
