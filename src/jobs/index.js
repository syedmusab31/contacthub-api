const queue = require('./queue');
const env = require('../config/env');

queue.register('send-email', require('./handlers/email.job'));
queue.register('birthday-reminders', require('./handlers/birthdayReminders.job'));
queue.register('purge-trash', require('./handlers/purgeTrash.job'));

async function startScheduler() {
  if (!env.ENABLE_SCHEDULER) return;
  await queue.schedule('birthday-reminders', env.BIRTHDAY_REMINDER_CRON);
  await queue.schedule('purge-trash', env.TRASH_PURGE_CRON);
}

module.exports = { queue, startScheduler };
