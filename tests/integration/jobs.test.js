const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { api, createUser, createContact, useDatabase, outbox } = require('../helpers/setup');
const Contact = require('../../src/modules/contacts/contact.model');
const birthdayRemindersJob = require('../../src/jobs/handlers/birthdayReminders.job');
const purgeTrashJob = require('../../src/jobs/handlers/purgeTrash.job');

useDatabase();

describe('birthday reminders job', () => {
  it('emails users whose contacts have a birthday today', async () => {
    const alice = await createUser();
    const bob = await createUser();
    await createContact(alice.auth, { name: 'Born Today', birthday: '1990-03-15' });
    await createContact(alice.auth, { name: 'Not Today', birthday: '1990-03-16' });
    await createContact(bob.auth, { name: 'Bob Friend', birthday: '1980-03-15' });
    await api()
      .patch('/api/v1/users/me')
      .set(bob.auth)
      .send({ preferences: { birthdayReminders: false } })
      .expect(200);
    outbox.length = 0;

    const result = await birthdayRemindersJob({ date: '2026-03-15T08:00:00Z' });

    assert.equal(result.users, 1);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, alice.email);
    assert.match(outbox[0].subject, /Born Today/);
    assert.match(outbox[0].text, /turns 36/);
  });
});

describe('purge trash job', () => {
  it('permanently deletes contacts past the retention period', async () => {
    const { auth } = await createUser();
    const old = await createContact(auth, { name: 'Old' });
    const recent = await createContact(auth, { name: 'Recent' });
    const active = await createContact(auth, { name: 'Active' });

    await Contact.updateOne({ _id: old.id }, { deletedAt: new Date(Date.now() - 40 * 86_400_000) });
    await Contact.updateOne({ _id: recent.id }, { deletedAt: new Date() });

    const { deletedCount } = await purgeTrashJob();
    assert.equal(deletedCount, 1);
    assert.equal(await Contact.countDocuments({ _id: old.id }), 0);
    assert.equal(await Contact.countDocuments({ _id: { $in: [recent.id, active.id] } }), 2);
  });
});
