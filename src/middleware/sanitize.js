/**
 * Strip keys that MongoDB treats as operators ("$gt", "a.b") from user input,
 * so a body like { "email": { "$ne": null } } can never reach a query.
 * (express-mongo-sanitize does not support Express 5, hence this small version.)
 */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      out[key] = clean(val);
    }
    return out;
  }
  return value;
}

function sanitize(req, res, next) {
  if (req.body) req.body = clean(req.body);
  if (req.query && Object.keys(req.query).length) {
    Object.defineProperty(req, 'query', {
      value: clean(req.query),
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  next();
}

module.exports = sanitize;
module.exports.clean = clean;
