const crypto = require('crypto');

/** Random URL-safe token, used for refresh / verification / reset tokens. */
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Tokens are stored hashed so a database leak does not leak usable tokens. */
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Keep a leading + and digits only, so "+1 (555) 010-2000" and "+15550102000" match. */
const normalizePhone = (value = '') => {
  const trimmed = String(value).trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
};

const normalizeEmail = (value = '') => String(value).trim().toLowerCase();

const pick = (obj, keys) =>
  keys.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const paginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

module.exports = {
  randomToken,
  sha256,
  escapeRegex,
  normalizePhone,
  normalizeEmail,
  pick,
  daysFromNow,
  paginationMeta,
};
