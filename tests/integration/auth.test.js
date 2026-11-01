process.env.GOOGLE_CLIENT_ID = 'test-client-id';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { OAuth2Client } = require('google-auth-library');
const { api, createUser, tokenFromEmail, useDatabase, PASSWORD } = require('../helpers/setup');
const RefreshToken = require('../../src/modules/auth/refreshToken.model');

useDatabase();

const login = (email, password) => api().post('/api/v1/auth/login').send({ email, password });
const refresh = (refreshToken) => api().post('/api/v1/auth/refresh').send({ refreshToken });

describe('POST /api/v1/auth/register', () => {
  it('creates an account and returns a session', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Jane Doe', email: 'Jane@Example.com', password: PASSWORD })
      .expect(201);

    const { user, accessToken } = res.body.data;
    assert.equal(user.email, 'jane@example.com');
    assert.equal(user.isEmailVerified, false);
    assert.equal(user.password, undefined);
    assert.ok(accessToken);
    assert.match(res.headers['set-cookie'][0], /refreshToken=.*HttpOnly/);
  });

  it('rejects weak passwords with a validation error', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Jane', email: 'jane@example.com', password: 'password' })
      .expect(422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.length > 0);
  });

  it('returns 409 for an email that is already registered', async () => {
    await createUser({ email: 'taken@example.com' });
    await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Other', email: 'TAKEN@example.com', password: PASSWORD })
      .expect(409);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('rejects a wrong password', async () => {
    const { email } = await createUser();
    const res = await login(email, 'Wr0ng!Pass').expect(401);
    assert.equal(res.body.error.message, 'Invalid email or password');
  });

  it('rejects an unknown email with the same message', async () => {
    const res = await login('nobody@example.com', PASSWORD).expect(401);
    assert.equal(res.body.error.message, 'Invalid email or password');
  });

  it('logs in with valid credentials', async () => {
    const { email } = await createUser();
    const res = await login(email, PASSWORD).expect(200);
    assert.ok(res.body.data.accessToken);
    assert.ok(res.body.data.refreshToken);
  });

  it('does not let Mongo operators through', async () => {
    await createUser();
    await api()
      .post('/api/v1/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } })
      .expect(422);
  });
});

describe('refresh token rotation', () => {
  it('issues a new pair and the new token works', async () => {
    const { refreshToken } = await createUser();
    const res = await refresh(refreshToken).expect(200);
    assert.notEqual(res.body.data.refreshToken, refreshToken);
    await refresh(res.body.data.refreshToken).expect(200);
  });

  it('accepts the refresh token from the cookie', async () => {
    const { refreshToken } = await createUser();
    await api().post('/api/v1/auth/refresh').set('Cookie', `refreshToken=${refreshToken}`).expect(200);
  });

  it('revokes the whole family when an old token is reused', async () => {
    const { refreshToken } = await createUser();
    const rotated = await refresh(refreshToken).expect(200);

    const reuse = await refresh(refreshToken).expect(401);
    assert.match(reuse.body.error.message, /reuse/);

    // The legitimately rotated token is dead too.
    await refresh(rotated.body.data.refreshToken).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await createUser();
    await api().post('/api/v1/auth/logout').send({ refreshToken }).expect(204);
    await refresh(refreshToken).expect(401);
  });

  it('logout-all revokes every session', async () => {
    const { auth, email } = await createUser();
    await login(email, PASSWORD).expect(200);
    await api().post('/api/v1/auth/logout-all').set(auth).expect(204);
    assert.equal(await RefreshToken.countDocuments({ revokedAt: null }), 0);
  });
});

describe('email verification', () => {
  it('verifies the email with the token that was mailed', async () => {
    const { email, auth } = await createUser();
    const token = tokenFromEmail(email);
    assert.ok(token);

    const res = await api().post('/api/v1/auth/verify-email').send({ token }).expect(200);
    assert.equal(res.body.data.user.isEmailVerified, true);

    await api().post('/api/v1/auth/verify-email').send({ token }).expect(400);
    await api().post('/api/v1/auth/resend-verification').set(auth).expect(400);
  });

  it('resending replaces the old token', async () => {
    const { email, auth } = await createUser();
    const first = tokenFromEmail(email);
    await api().post('/api/v1/auth/resend-verification').set(auth).expect(200);
    const second = tokenFromEmail(email);
    assert.notEqual(second, first);
    await api().post('/api/v1/auth/verify-email').send({ token: first }).expect(400);
    await api().post('/api/v1/auth/verify-email').send({ token: second }).expect(200);
  });
});

describe('password reset', () => {
  it('resets the password and invalidates existing sessions', async () => {
    const { email, auth, refreshToken } = await createUser();
    await api().post('/api/v1/auth/forgot-password').send({ email }).expect(200);
    const token = tokenFromEmail(email);
    assert.ok(token);

    await new Promise((r) => setTimeout(r, 1100)); // JWT iat has one-second resolution
    await api().post('/api/v1/auth/reset-password').send({ token, password: 'N3w!Password' }).expect(200);

    await api().get('/api/v1/users/me').set(auth).expect(401);
    await refresh(refreshToken).expect(401);
    await login(email, PASSWORD).expect(401);
    await login(email, 'N3w!Password').expect(200);
    await api().post('/api/v1/auth/reset-password').send({ token, password: 'An0ther!Pass' }).expect(400);
  });

  it('does not reveal whether an email exists', async () => {
    const res = await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com' })
      .expect(200);
    assert.match(res.body.data.message, /If that email is registered/);
  });
});

describe('POST /api/v1/auth/google', () => {
  afterEach(() => mock.restoreAll());

  const googleReturns = (payload) =>
    mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({ getPayload: () => payload }));

  it('creates a verified account for a new Google user', async () => {
    googleReturns({ sub: 'g-123', email: 'gina@gmail.com', email_verified: true, name: 'Gina' });
    const res = await api().post('/api/v1/auth/google').send({ idToken: 'valid-google-token' }).expect(201);
    assert.equal(res.body.data.user.email, 'gina@gmail.com');
    assert.equal(res.body.data.user.isEmailVerified, true);
  });

  it('links Google to an existing email account', async () => {
    const { email } = await createUser({ email: 'link@gmail.com' });
    googleReturns({ sub: 'g-456', email, email_verified: true, name: 'Link' });
    const res = await api().post('/api/v1/auth/google').send({ idToken: 'valid-google-token' }).expect(200);
    assert.equal(res.body.data.user.isEmailVerified, true);
  });

  it('rejects an unverified Google email', async () => {
    googleReturns({ sub: 'g-789', email: 'x@gmail.com', email_verified: false });
    await api().post('/api/v1/auth/google').send({ idToken: 'valid-google-token' }).expect(401);
  });

  it('rejects an invalid Google token', async () => {
    mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => {
      throw new Error('bad token');
    });
    await api().post('/api/v1/auth/google').send({ idToken: 'invalid-google-token' }).expect(401);
  });
});
