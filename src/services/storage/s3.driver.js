const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const env = require('../../config/env');
const logger = require('../../config/logger');

// Credentials come from the standard AWS environment variables / IAM role.
const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT || undefined,
  forcePathStyle: Boolean(env.S3_ENDPOINT),
});

const publicBase = env.S3_PUBLIC_URL || `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;

async function put(key, buffer, contentType) {
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return `${publicBase.replace(/\/$/, '')}/${key}`;
}

async function remove(key) {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch (err) {
    logger.warn({ err, key }, 'Could not delete S3 object');
  }
}

module.exports = { put, remove };
