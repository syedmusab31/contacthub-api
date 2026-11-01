/**
 * Every successful response has the shape { success: true, data, meta? }
 * so clients can handle all endpoints the same way.
 */
function send(res, statusCode, data, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

const ok = (res, data, meta) => send(res, 200, data, meta);
const created = (res, data) => send(res, 201, data);
const noContent = (res) => res.status(204).end();

module.exports = { ok, created, noContent };
