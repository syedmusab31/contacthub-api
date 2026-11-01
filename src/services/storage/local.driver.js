const fs = require('fs/promises');
const path = require('path');
const env = require('../../config/env');
const logger = require('../../config/logger');

const root = path.resolve(env.UPLOAD_DIR);

/** Resolve the key inside the upload dir and refuse anything that escapes it. */
function resolveKey(key) {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key');
  return full;
}

async function put(key, buffer) {
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return `${env.PUBLIC_API_URL}/uploads/${key}`;
}

async function remove(key) {
  try {
    await fs.unlink(resolveKey(key));
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn({ err, key }, 'Could not delete file');
  }
}

module.exports = { put, remove, root };
