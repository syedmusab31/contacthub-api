const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { api, createUser, useDatabase } = require('../helpers/setup');

useDatabase();

describe('system endpoints', () => {
  it('reports health and readiness', async () => {
    const health = await api().get('/health').expect(200);
    assert.equal(health.body.status, 'ok');
    const ready = await api().get('/ready').expect(200);
    assert.equal(ready.body.checks.database, 'up');
  });

  it('exposes Prometheus metrics', async () => {
    await api().get('/health');
    const res = await api().get('/metrics').expect(200);
    assert.match(res.text, /http_request_duration_seconds/);
  });

  it('serves the OpenAPI spec', async () => {
    const res = await api().get('/api/docs.json').expect(200);
    assert.equal(res.body.openapi, '3.0.3');
  });

  it('returns a consistent 404 body', async () => {
    const res = await api().get('/api/v1/nope').expect(404);
    assert.deepEqual(res.body, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/nope not found' },
    });
  });

  it('handles malformed JSON', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    assert.equal(res.body.error.message, 'Malformed JSON body');
  });

  it('sets security headers and a request id', async () => {
    const res = await api().get('/health').set('X-Request-Id', 'abc-123');
    assert.equal(res.headers['x-request-id'], 'abc-123');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  it('treats bracket query params as plain strings', async () => {
    // Express 5 uses the simple query parser, so tag[$ne]=x can't become an operator.
    const { auth } = await createUser();
    const res = await api().get('/api/v1/contacts?tag[$ne]=x').set(auth).expect(200);
    assert.deepEqual(res.body.data, []);
  });

  it('never leaks stack traces for handled errors', async () => {
    const res = await api().get('/api/v1/users/me').expect(401);
    assert.equal(res.body.error.stack, undefined);
  });
});

describe('audit log', () => {
  it("lists the signed-in user's own activity", async () => {
    const { auth } = await createUser();
    const other = await createUser();
    await api().post('/api/v1/contacts').set(auth).send({ name: 'Logged' }).expect(201);

    const res = await api().get('/api/v1/audit-logs').set(auth).expect(200);
    assert.deepEqual(
      res.body.data.map((e) => e.action),
      ['contact.created', 'user.registered']
    );
    const filtered = await api().get('/api/v1/audit-logs').query({ entityType: 'contact' }).set(auth);
    assert.equal(filtered.body.data.length, 1);

    const theirs = await api().get('/api/v1/audit-logs').set(other.auth).expect(200);
    assert.equal(theirs.body.data.length, 1);
  });
});
