const Contact = require('../../modules/contacts/contact.model');
const User = require('../../modules/users/user.model');
const queue = require('../queue');
const logger = require('../../config/logger');

/**
 * Email every user (who has reminders on) the list of contacts whose birthday
 * is today. Birthdays are stored as UTC dates, so month/day compare in UTC.
 */
async function birthdayRemindersJob({ date } = {}) {
  const today = date ? new Date(date) : new Date();
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();

  const groups = await Contact.aggregate([
    {
      $match: {
        deletedAt: null,
        birthday: { $ne: null },
        $expr: {
          $and: [{ $eq: [{ $month: '$birthday' }, month] }, { $eq: [{ $dayOfMonth: '$birthday' }, day] }],
        },
      },
    },
    { $group: { _id: '$owner', contacts: { $push: { name: '$name', birthday: '$birthday' } } } },
  ]);

  let sent = 0;
  for (const group of groups) {
    const user = await User.findById(group._id);
    if (!user || !user.preferences?.birthdayReminders) continue;

    const contacts = group.contacts.map((c) => {
      const year = new Date(c.birthday).getUTCFullYear();
      // Year 1900 or earlier is treated as "year unknown".
      return { name: c.name, age: year > 1900 ? today.getUTCFullYear() - year : undefined };
    });

    await queue.enqueue('send-email', {
      to: user.email,
      template: 'birthdayReminder',
      params: { name: user.name, contacts },
    });
    sent += 1;
  }

  logger.info({ users: sent }, 'Birthday reminders queued');
  return { users: sent };
}

module.exports = birthdayRemindersJob;
