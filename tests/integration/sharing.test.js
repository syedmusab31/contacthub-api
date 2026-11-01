const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { api, createUser, createContact, useDatabase, outbox } = require('../helpers/setup');

useDatabase();

const share = (auth, id, email, role) =>
  api().post(`/api/v1/contacts/${id}/share`).set(auth).send({ email, role });

describe('contact sharing', () => {
  it('shares a contact as viewer: read only', async () => {
    const owner = await createUser({ name: 'Owner' });
    const viewer = await createUser();
    const contact = await createContact(owner.auth, { notes: 'secret-ish', isFavorite: true });

    const res = await share(owner.auth, contact.id, viewer.email, 'viewer').expect(200);
    assert.equal(res.body.data.sharedWith[0].user.email, viewer.email);
    assert.ok(outbox.some((m) => m.to === viewer.email && /shared a contact/.test(m.subject)));

    const got = await api().get(`/api/v1/contacts/${contact.id}`).set(viewer.auth).expect(200);
    assert.equal(got.body.data.contact.access, 'viewer');
    assert.equal(got.body.data.contact.sharedWith, undefined);
    assert.equal(got.body.data.contact.isFavorite, undefined);

    await api().patch(`/api/v1/contacts/${contact.id}`).set(viewer.auth).send({ name: 'X' }).expect(403);
    await api().delete(`/api/v1/contacts/${contact.id}`).set(viewer.auth).expect(403);

    const sharedList = await api().get('/api/v1/contacts/shared').set(viewer.auth).expect(200);
    assert.equal(sharedList.body.data.length, 1);
    assert.equal(sharedList.body.data[0].owner.name, 'Owner');
  });

  it('editors can update details but not owner-only fields', async () => {
    const owner = await createUser();
    const editor = await createUser();
    const contact = await createContact(owner.auth);
    await share(owner.auth, contact.id, editor.email, 'editor').expect(200);

    await api()
      .patch(`/api/v1/contacts/${contact.id}`)
      .set(editor.auth)
      .send({ company: 'New Co' })
      .expect(200);
    await api()
      .patch(`/api/v1/contacts/${contact.id}`)
      .set(editor.auth)
      .send({ isFavorite: true })
      .expect(403);
    await share(editor.auth, contact.id, owner.email, 'viewer').expect(403);
  });

  it('changing the role updates the existing share', async () => {
    const owner = await createUser();
    const other = await createUser();
    const contact = await createContact(owner.auth);
    await share(owner.auth, contact.id, other.email, 'viewer').expect(200);
    const res = await share(owner.auth, contact.id, other.email, 'editor').expect(200);
    assert.equal(res.body.data.sharedWith.length, 1);
    assert.equal(res.body.data.sharedWith[0].role, 'editor');
  });

  it('cannot share with yourself or an unknown user', async () => {
    const owner = await createUser();
    const contact = await createContact(owner.auth);
    await share(owner.auth, contact.id, owner.email, 'viewer').expect(400);
    await share(owner.auth, contact.id, 'nobody@example.com', 'viewer').expect(404);
  });

  it('owner can revoke access and recipients can leave', async () => {
    const owner = await createUser();
    const a = await createUser();
    const b = await createUser();
    const contact = await createContact(owner.auth);
    await share(owner.auth, contact.id, a.email, 'viewer').expect(200);
    await share(owner.auth, contact.id, b.email, 'viewer').expect(200);

    await api().delete(`/api/v1/contacts/${contact.id}/share/${b.user.id}`).set(a.auth).expect(403);
    await api().delete(`/api/v1/contacts/${contact.id}/share/${a.user.id}`).set(a.auth).expect(204);
    await api().get(`/api/v1/contacts/${contact.id}`).set(a.auth).expect(404);

    await api().delete(`/api/v1/contacts/${contact.id}/share/${b.user.id}`).set(owner.auth).expect(204);
    await api().get(`/api/v1/contacts/${contact.id}`).set(b.auth).expect(404);
  });
});
