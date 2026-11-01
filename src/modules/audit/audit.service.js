const AuditLog = require('./audit.model');
const logger = require('../../config/logger');
const { paginationMeta } = require('../../utils/helpers');

const IGNORED_FIELDS = new Set(['updatedAt', 'createdAt', '__v', '_id']);

const toComparable = (value) => JSON.stringify(value ?? null);

/** Build { field: { from, to } } for the fields that actually changed. */
function diff(before = {}, after = {}) {
  const changes = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (toComparable(before[key]) !== toComparable(after[key])) {
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return Object.keys(changes).length ? changes : undefined;
}

/**
 * Audit logging must never break the request that triggered it,
 * so failures are logged and swallowed.
 */
async function record({ actor, action, entityType, entityId, changes, metadata, context = {} }) {
  try {
    await AuditLog.create({
      actor,
      action,
      entityType,
      entityId,
      changes,
      metadata,
      ip: context.ip,
      userAgent: context.userAgent?.slice(0, 300),
    });
  } catch (err) {
    logger.error({ err, action, entityId }, 'Failed to write audit log');
  }
}

async function list(filter, { page, limit }) {
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(page, limit, total) };
}

/** Request info that goes into every audit entry. */
const contextFrom = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

module.exports = { record, list, diff, contextFrom };
