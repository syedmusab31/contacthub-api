const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { api, createUser, createContact, useDatabase, PASSWORD } = require('../helpers/setup');
const Contact = require('../../src/modules/contacts/contact.model');
const User = require('../../src/modules/users/user.model');

useDatabase();

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

describe('/api/v1/users/me', () => {
  it('requires authentication', async () => {
    const res = await api().get('/api/v1/users/me').expect(401);
    assert.equal(res.body.success, false);
  });

  it('rejects a tampered token', async () => {
    const { accessToken } = await createUser();
    await api()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken.slice(0, -2)}xx`)
      .expect(401);
  });

  it('returns the current user', async () => {
    const { auth, email } = await createUser();
    const res = await api().get('/api/v1/users/me').set(auth).expect(200);
    assert.equal(res.body.data.user.email, email);
  });

  it('updates name and preferences', async () => {
    const { auth } = await createUser();
    const res = await api()
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ name: 'Renamed', preferences: { birthdayReminders: false } })
      .expect(200);
    assert.equal(res.body.data.user.name, 'Renamed');
    assert.equal(res.body.data.user.preferences.birthdayReminders, false);
    assert.equal(res.body.data.user.preferences.timezone, 'UTC');
  });

  it('ignores fields that are not allowed', async () => {
    const { auth, user } = await createUser();
    await api()
      .patch('/api/v1/users/me')
      .set(auth)
      .send({ name: 'X', isEmailVerified: true, email: 'h@x.com' })
      .expect(200);
    const stored = await User.findById(user.id);
    assert.equal(stored.isEmailVerified, false);
    assert.notEqual(stored.email, 'h@x.com');
  });
});

describe('PATCH /api/v1/users/me/password', () => {
  it('needs the correct current password', async () => {
    const { auth } = await createUser();
    await api()
      .patch('/api/v1/users/me/password')
      .set(auth)
      .send({ currentPassword: 'Wr0ng!Pass', newPassword: 'N3w!Password' })
      .expect(401);
  });

  it('changes the password and returns a fresh session', async () => {
    const { auth, email, refreshToken } = await createUser();
    await new Promise((r) => setTimeout(r, 1100));
    const res = await api()
      .patch('/api/v1/users/me/password')
      .set(auth)
      .send({ currentPassword: PASSWORD, newPassword: 'N3w!Password' })
      .expect(200);

    await api().get('/api/v1/users/me').set(auth).expect(401);
    await api()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .expect(200);
    await api().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    await api().post('/api/v1/auth/login').send({ email, password: 'N3w!Password' }).expect(200);
  });
});

describe('avatar', () => {
  it('uploads and removes an avatar', async () => {
    const { auth } = await createUser();
    const res = await api()
      .put('/api/v1/users/me/avatar')
      .set(auth)
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' })
      .expect(200);
    const { url } = res.body.data.user.avatar;
    assert.match(url, /\/uploads\/avatars\/users\/.+\.png$/);

    await api().get(new URL(url).pathname).expect(200);

    const removed = await api().delete('/api/v1/users/me/avatar').set(auth).expect(200);
    assert.equal(removed.body.data.user.avatar, undefined);
  });

  it('rejects non-image files', async () => {
    const { auth } = await createUser();
    await api()
      .put('/api/v1/users/me/avatar')
      .set(auth)
      .attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(415);
  });
});

describe('DELETE /api/v1/users/me', () => {
  it('requires the password', async () => {
    const { auth } = await createUser();
    await api().delete('/api/v1/users/me').set(auth).send({ password: 'Wr0ng!Pass' }).expect(401);
  });

  it('deletes the account and its contacts', async () => {
    const { auth, user } = await createUser();
    await createContact(auth);
    await api().delete('/api/v1/users/me').set(auth).send({ password: PASSWORD }).expect(204);

    assert.equal(await User.countDocuments({ _id: user.id }), 0);
    assert.equal(await Contact.countDocuments({ owner: user.id }), 0);
    await api().get('/api/v1/users/me').set(auth).expect(401);
  });
});
