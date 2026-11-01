require('dotenv').config({ quiet: true });
const { z } = require('zod');

const bool = (fallback) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  // Accept the old CONNECTION_STRING name so existing .env files keep working.
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  APP_URL: z.url().default('http://localhost:3000'),
  PUBLIC_API_URL: z.url().default('http://localhost:5000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  REQUIRE_EMAIL_VERIFICATION: bool(false),

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  REDIS_URL: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: bool(false),
  MAIL_FROM: z.string().default('Contact Manager <no-reply@contactmanager.local>'),

  GOOGLE_CLIENT_ID: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  BIRTHDAY_REMINDER_CRON: z.string().default('0 8 * * *'),
  TRASH_PURGE_CRON: z.string().default('30 3 * * *'),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  CRON_TIMEZONE: z.string().default('UTC'),
  ENABLE_SCHEDULER: bool(true),
  RUN_WORKER_IN_API: bool(true),

  ENABLE_METRICS: bool(true),
  ENABLE_API_DOCS: bool(true),
});

const raw = { ...process.env };
if (!raw.MONGODB_URI && raw.CONNECTION_STRING) raw.MONGODB_URI = raw.CONNECTION_STRING;
if (raw.NODE_ENV === 'test') {
  raw.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/contact-manager-test';
  raw.JWT_ACCESS_SECRET ||= 'test-secret-test-secret-test-secret-123';
  raw.ENABLE_SCHEDULER ||= 'false';
}

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  // Logger depends on env, so plain stderr is the only option here.
  process.stderr.write(`Invalid environment configuration:\n${lines.join('\n')}\n`);
  process.exit(1);
}

const env = parsed.data;

if (env.STORAGE_DRIVER === 's3' && (!env.S3_BUCKET || !env.S3_REGION)) {
  process.stderr.write('STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION\n');
  process.exit(1);
}

module.exports = Object.freeze({
  ...env,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
});
