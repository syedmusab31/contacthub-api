const { before, after, afterEach } = require('node:test');
const request = require('supertest');
const createApp = require('../../src/app');
const db = require('./db');
const { outbox } = require('../../src/services/mail/mail.service');

const app = createApp();
const api = () => request(app);

const PASSWORD = 'Str0ng!Pass';
let counter = 0;

/** Register a fresh user and return an authenticated helper. */
async function createUser(overrides = {}) {
  counter += 1;
  const body = {
    name: overrides.name || `User ${counter}`,
    email: overrides.email || `user${counter}@example.com`,
    password: overrides.password || PASSWORD,
  };
  const res = await api().post('/api/v1/auth/register').send(body).expect(201);
  const { user, accessToken, refreshToken } = res.body.data;
  const auth = { Authorization: `Bearer ${accessToken}` };
  return { user, accessToken, refreshToken, auth, password: body.password, email: body.email };
}

async function createContact(auth, body = {}) {
  const res = await api()
    .post('/api/v1/contacts')
    .set(auth)
    .send({ name: 'Ada Lovelace', ...body })
    .expect(201);
  return res.body.data.contact;
}

/** Pull the token out of the latest captured email sent to `to`. */
function tokenFromEmail(to) {
  const mail = [...outbox].reverse().find((m) => m.to === to);
  const match = mail?.text.match(/token=([\w-]+)/);
  return match?.[1];
}

/** Standard lifecycle hooks for integration test files. */
function useDatabase() {
  before(db.connect);
  afterEach(async () => {
    await db.clear();
    outbox.length = 0;
  });
  after(db.close);
}

module.exports = { app, api, createUser, createContact, tokenFromEmail, useDatabase, outbox, PASSWORD };
