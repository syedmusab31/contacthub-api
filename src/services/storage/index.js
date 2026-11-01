const crypto = require('crypto');
const path = require('path');
const env = require('../../config/env');

const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const driver = env.STORAGE_DRIVER === 's3' ? require('./s3.driver') : require('./local.driver');

/**
 * Store an uploaded file under a random key and return { key, url }.
 * Callers keep the key so the file can be removed later.
 */
async function save(file, folder) {
  const ext = EXTENSIONS[file.mimetype] || path.extname(file.originalname || '') || '';
  const key = `${folder}/${crypto.randomUUID()}${ext}`;
  const url = await driver.put(key, file.buffer, file.mimetype);
  return { key, url };
}

async function remove(key) {
  if (key) await driver.remove(key);
}

module.exports = { save, remove };
