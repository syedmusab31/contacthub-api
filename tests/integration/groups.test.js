const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { api, createUser, createContact, useDatabase } = require('../helpers/setup');

useDatabase();

const createGroup = async (auth, body) =>
  (await api().post('/api/v1/groups').set(auth).send(body).expect(201)).body.data.group;

describe('groups', () => {
  it('creates, renames and lists groups with counts', async () => {
    const { auth } = await createUser();
    const family = await createGroup(auth, { name: 'Family', color: '#16a34a' });
    await createContact(auth, { groups: [family.id] });

    await api().post('/api/v1/groups').set(auth).send({ name: 'family' }).expect(409);
    await api().post('/api/v1/groups').set(auth).send({ name: 'Bad', color: 'red' }).expect(422);

    await api().patch(`/api/v1/groups/${family.id}`).set(auth).send({ name: 'Relatives' }).expect(200);
    const list = await api().get('/api/v1/groups').set(auth).expect(200);
    assert.deepEqual(
      list.body.data.map((g) => [g.name, g.contactCount]),
      [['Relatives', 1]]
    );
  });

  it('adds and removes contacts in bulk', async () => {
    const { auth } = await createUser();
    const group = await createGroup(auth, { name: 'Team' });
    const a = await createContact(auth, { name: 'A' });
    const b = await createContact(auth, { name: 'B' });

    const added = await api()
      .post(`/api/v1/groups/${group.id}/contacts`)
      .set(auth)
      .send({ contactIds: [a.id, b.id] })
      .expect(200);
    assert.equal(added.body.data.added, 2);

    const members = await api().get(`/api/v1/groups/${group.id}/contacts`).set(auth).expect(200);
    assert.deepEqual(
      members.body.data.map((c) => c.name),
      ['A', 'B']
    );

    const filtered = await api().get('/api/v1/contacts').query({ group: group.id }).set(auth).expect(200);
    assert.equal(filtered.body.data.length, 2);

    await api()
      .delete(`/api/v1/groups/${group.id}/contacts`)
      .set(auth)
      .send({ contactIds: [a.id] })
      .expect(200);
    const after = await api().get(`/api/v1/groups/${group.id}`).set(auth).expect(200);
    assert.equal(after.body.data.group.contactCount, 1);
  });

  it('deleting a group keeps its contacts', async () => {
    const { auth } = await createUser();
    const group = await createGroup(auth, { name: 'Temp' });
    const contact = await createContact(auth, { groups: [group.id] });

    await api().delete(`/api/v1/groups/${group.id}`).set(auth).expect(204);
    const res = await api().get(`/api/v1/contacts/${contact.id}`).set(auth).expect(200);
    assert.deepEqual(res.body.data.contact.groups, []);
  });

  it("cannot use another user's group", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const group = await createGroup(alice.auth, { name: 'Private' });

    await api().get(`/api/v1/groups/${group.id}`).set(bob.auth).expect(404);
    await api()
      .post('/api/v1/contacts')
      .set(bob.auth)
      .send({ name: 'X', groups: [group.id] })
      .expect(422);
  });
});
