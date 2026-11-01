const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { api, createUser, createContact, useDatabase } = require('../helpers/setup');
const Contact = require('../../src/modules/contacts/contact.model');

useDatabase();

const url = (path = '') => `/api/v1/contacts${path}`;

describe('contacts: authentication and isolation', () => {
  it('requires a token', async () => {
    await api().get(url()).expect(401);
    await api().post(url()).send({ name: 'X' }).expect(401);
  });

  it("users can never see or touch each other's contacts", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const contact = await createContact(alice.auth);

    const list = await api().get(url()).set(bob.auth).expect(200);
    assert.equal(list.body.data.length, 0);
    await api()
      .get(url(`/${contact.id}`))
      .set(bob.auth)
      .expect(404);
    await api()
      .patch(url(`/${contact.id}`))
      .set(bob.auth)
      .send({ name: 'Hacked' })
      .expect(404);
    await api()
      .delete(url(`/${contact.id}`))
      .set(bob.auth)
      .expect(404);
  });
});

describe('contacts: CRUD', () => {
  it('creates a contact with full details', async () => {
    const { auth } = await createUser();
    const res = await api()
      .post(url())
      .set(auth)
      .send({
        name: 'Grace Hopper',
        company: 'US Navy',
        emails: [{ label: 'work', value: 'Grace@Navy.mil' }],
        phones: [{ value: '+1 (555) 010-2000' }],
        addresses: [{ city: 'Arlington', country: 'USA' }],
        birthday: '1906-12-09',
        tags: ['Pioneer', 'pioneer', 'COBOL'],
        isFavorite: true,
      })
      .expect(201);

    const c = res.body.data.contact;
    assert.equal(c.emails[0].value, 'grace@navy.mil');
    assert.deepEqual(c.tags, ['pioneer', 'cobol']);
    assert.equal(c.phones[0].normalized, undefined);
    assert.equal(c.access, 'owner');
    assert.deepEqual(res.body.data.possibleDuplicates, []);
  });

  it('still accepts the old single email/phone fields', async () => {
    const { auth } = await createUser();
    const c = await createContact(auth, { email: 'old@x.com', phone: '0300 1234567' });
    assert.equal(c.emails[0].value, 'old@x.com');
    assert.equal(c.phones[0].value, '0300 1234567');
  });

  it('validates input', async () => {
    const { auth } = await createUser();
    const res = await api()
      .post(url())
      .set(auth)
      .send({ name: '', emails: [{ value: 'not-an-email' }], birthday: '2999-01-01' })
      .expect(422);
    const paths = res.body.error.details.map((d) => d.path);
    assert.ok(paths.includes('name'));
    assert.ok(paths.includes('emails.0.value'));
    assert.ok(paths.includes('birthday'));
  });

  it('returns 422 for a malformed id instead of a server error', async () => {
    const { auth } = await createUser();
    await api().get(url('/not-an-id')).set(auth).expect(422);
    await api().delete(url('/123')).set(auth).expect(422);
  });

  it('returns 404 for a contact that does not exist', async () => {
    const { auth } = await createUser();
    await api().get(url('/64b7f0c2a1b2c3d4e5f60718')).set(auth).expect(404);
  });

  it('flags possible duplicates on create', async () => {
    const { auth } = await createUser();
    const first = await createContact(auth, { emails: [{ value: 'dup@x.com' }] });
    const res = await api().post(url()).set(auth).send({ name: 'Other', email: 'dup@x.com' }).expect(201);
    assert.deepEqual(res.body.data.possibleDuplicates, [{ id: first.id, name: first.name }]);
  });

  it('updates only the fields that are sent and ignores protected ones', async () => {
    const { auth, user } = await createUser();
    const other = await createUser();
    const contact = await createContact(auth, { company: 'Analytical Engines' });

    const res = await api()
      .patch(url(`/${contact.id}`))
      .set(auth)
      .send({ jobTitle: 'Mathematician', owner: other.user.id, deletedAt: new Date() })
      .expect(200);

    assert.equal(res.body.data.contact.jobTitle, 'Mathematician');
    assert.equal(res.body.data.contact.company, 'Analytical Engines');
    const stored = await Contact.findById(contact.id);
    assert.equal(String(stored.owner), user.id);
    assert.equal(stored.deletedAt, null);
  });

  it('rejects an empty update', async () => {
    const { auth } = await createUser();
    const contact = await createContact(auth);
    await api()
      .patch(url(`/${contact.id}`))
      .set(auth)
      .send({})
      .expect(422);
  });

  it('records history of changes', async () => {
    const { auth } = await createUser();
    const contact = await createContact(auth);
    await api()
      .patch(url(`/${contact.id}`))
      .set(auth)
      .send({ name: 'Countess Ada' })
      .expect(200);

    const res = await api()
      .get(url(`/${contact.id}/history`))
      .set(auth)
      .expect(200);
    const actions = res.body.data.map((e) => e.action);
    assert.deepEqual(actions, ['contact.updated', 'contact.created']);
    assert.deepEqual(res.body.data[0].changes.name, { from: 'Ada Lovelace', to: 'Countess Ada' });
  });
});

describe('contacts: listing', () => {
  async function seed(auth) {
    await createContact(auth, {
      name: 'Charlie',
      company: 'Acme',
      tags: ['work'],
      phones: [{ value: '+92 300 1112233' }],
    });
    await createContact(auth, { name: 'alice', tags: ['family'], isFavorite: true });
    await createContact(auth, { name: 'Bob', emails: [{ value: 'bob@acme.io' }], tags: ['work'] });
  }

  it('sorts favourites first, then by name (case-insensitive)', async () => {
    const { auth } = await createUser();
    await seed(auth);
    const res = await api().get(url()).set(auth).expect(200);
    assert.deepEqual(
      res.body.data.map((c) => c.name),
      ['alice', 'Bob', 'Charlie']
    );
    assert.deepEqual(res.body.meta, { page: 1, limit: 20, total: 3, totalPages: 1 });
  });

  it('searches name, company, email and phone', async () => {
    const { auth } = await createUser();
    await seed(auth);
    const names = async (q) =>
      (await api().get(url()).query({ q }).set(auth).expect(200)).body.data.map((c) => c.name).sort();

    assert.deepEqual(await names('acme'), ['Bob', 'Charlie']);
    assert.deepEqual(await names('ALI'), ['alice']);
    assert.deepEqual(await names('3001112'), ['Charlie']);
    assert.deepEqual(await names('.*'), []); // regex characters are escaped
  });

  it('filters by tag and favourite', async () => {
    const { auth } = await createUser();
    await seed(auth);
    const byTag = await api().get(url()).query({ tag: 'WORK' }).set(auth).expect(200);
    assert.equal(byTag.body.data.length, 2);
    const favs = await api().get(url()).query({ favorite: 'true' }).set(auth).expect(200);
    assert.deepEqual(
      favs.body.data.map((c) => c.name),
      ['alice']
    );
  });

  it('paginates', async () => {
    const { auth } = await createUser();
    await seed(auth);
    const res = await api().get(url()).query({ page: 2, limit: 2 }).set(auth).expect(200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.meta.totalPages, 2);
    await api().get(url()).query({ limit: 1000 }).set(auth).expect(422);
  });

  it('lists tags with counts', async () => {
    const { auth } = await createUser();
    await seed(auth);
    const res = await api().get(url('/tags')).set(auth).expect(200);
    assert.deepEqual(res.body.data, [
      { tag: 'work', count: 2 },
      { tag: 'family', count: 1 },
    ]);
  });
});

describe('contacts: trash', () => {
  it('soft deletes, restores and permanently deletes', async () => {
    const { auth } = await createUser();
    const contact = await createContact(auth);

    await api()
      .delete(url(`/${contact.id}`))
      .set(auth)
      .expect(204);
    await api()
      .get(url(`/${contact.id}`))
      .set(auth)
      .expect(404);
    assert.equal((await api().get(url()).set(auth)).body.data.length, 0);

    const trash = await api().get(url('/trash')).set(auth).expect(200);
    assert.equal(trash.body.data.length, 1);
    assert.ok(trash.body.data[0].purgeAt);

    await api()
      .post(url(`/trash/${contact.id}/restore`))
      .set(auth)
      .expect(200);
    await api()
      .get(url(`/${contact.id}`))
      .set(auth)
      .expect(200);

    await api()
      .delete(url(`/${contact.id}`))
      .set(auth)
      .expect(204);
    await api()
      .delete(url(`/trash/${contact.id}`))
      .set(auth)
      .expect(204);
    assert.equal(await Contact.countDocuments({ _id: contact.id }), 0);
  });

  it('only deletes from the trash permanently', async () => {
    const { auth } = await createUser();
    const contact = await createContact(auth);
    await api()
      .delete(url(`/trash/${contact.id}`))
      .set(auth)
      .expect(404);
  });

  it('empties the trash', async () => {
    const { auth } = await createUser();
    const a = await createContact(auth);
    const b = await createContact(auth, { name: 'B' });
    await api()
      .delete(url(`/${a.id}`))
      .set(auth)
      .expect(204);
    await api()
      .delete(url(`/${b.id}`))
      .set(auth)
      .expect(204);
    const res = await api().delete(url('/trash')).set(auth).expect(200);
    assert.equal(res.body.data.deletedCount, 2);
  });
});

describe('contacts: birthdays', () => {
  it('lists upcoming birthdays in order', async () => {
    const { auth } = await createUser();
    const now = new Date();
    const inDays = (d, year) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
      return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    };
    await createContact(auth, { name: 'Soon', birthday: inDays(3, 1990) });
    await createContact(auth, { name: 'Today', birthday: inDays(0, 1985) });
    await createContact(auth, { name: 'Later', birthday: inDays(60, 1990) });

    const res = await api().get(url('/birthdays/upcoming')).query({ days: 30 }).set(auth).expect(200);
    assert.deepEqual(
      res.body.data.map((c) => c.name),
      ['Today', 'Soon']
    );
    assert.equal(res.body.data[0].daysUntil, 0);
    assert.equal(typeof res.body.data[0].turningAge, 'number');
  });
});

describe('contacts: duplicates and merge', () => {
  it('finds clusters and merges them', async () => {
    const { auth } = await createUser();
    const a = await createContact(auth, {
      name: 'Alan Turing',
      emails: [{ value: 'alan@bletchley.uk' }],
      tags: ['math'],
    });
    const b = await createContact(auth, {
      name: 'A. Turing',
      emails: [{ value: 'alan@bletchley.uk' }],
      phones: [{ value: '+44 20 7946 0000' }],
      company: 'Bletchley Park',
      notes: 'Enigma',
    });
    const c = await createContact(auth, {
      name: 'Turing (work)',
      phones: [{ value: '+442079460000' }],
      tags: ['work'],
    });
    await createContact(auth, { name: 'Unrelated' });

    const dups = await api().get(url('/duplicates')).set(auth).expect(200);
    assert.equal(dups.body.data.length, 1);
    assert.equal(dups.body.data[0].contacts.length, 3);

    const merged = await api()
      .post(url('/merge'))
      .set(auth)
      .send({ primaryId: a.id, duplicateIds: [b.id, c.id] })
      .expect(200);

    const m = merged.body.data.contact;
    assert.equal(m.name, 'Alan Turing');
    assert.equal(m.company, 'Bletchley Park');
    assert.equal(m.emails.length, 1);
    assert.equal(m.phones.length, 1);
    assert.deepEqual(m.tags.sort(), ['math', 'work']);
    assert.equal(m.notes, 'Enigma');

    const trash = await api().get(url('/trash')).set(auth).expect(200);
    assert.equal(trash.body.data.length, 2);
  });

  it('refuses to merge contacts of another user', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const a = await createContact(alice.auth);
    const b = await createContact(bob.auth);
    await api()
      .post(url('/merge'))
      .set(alice.auth)
      .send({ primaryId: a.id, duplicateIds: [b.id] })
      .expect(404);
  });
});

describe('contacts: avatar', () => {
  it('uploads a contact photo', async () => {
    const { auth } = await createUser();
    const contact = await createContact(auth);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    const res = await api()
      .put(url(`/${contact.id}/avatar`))
      .set(auth)
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    assert.match(res.body.data.contact.avatar.url, /\.png$/);
    assert.equal(res.body.data.contact.avatar.key, undefined);
  });
});
