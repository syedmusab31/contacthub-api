const Contact = require('../../modules/contacts/contact.model');
const storage = require('../../services/storage');
const env = require('../../config/env');
const logger = require('../../config/logger');

/** Permanently delete contacts that have been in the trash past the retention period. */
async function purgeTrashJob() {
  const cutoff = new Date(Date.now() - env.TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await Contact.find({ deletedAt: { $ne: null, $lte: cutoff } }).select('avatar');

  for (const contact of expired) {
    if (contact.avatar?.key) await storage.remove(contact.avatar.key);
  }
  const { deletedCount } = await Contact.deleteMany({ _id: { $in: expired.map((c) => c._id) } });

  logger.info({ deletedCount }, 'Trash purged');
  return { deletedCount };
}

module.exports = purgeTrashJob;
