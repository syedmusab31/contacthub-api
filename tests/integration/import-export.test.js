const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { api, createUser, createContact, useDatabase } = require('../helpers/setup');

useDatabase();

const upload = (auth, content, filename, query = {}) =>
  api()
    .post('/api/v1/contacts/import')
    .query(query)
    .set(auth)
    .attach('file', Buffer.from(content), {
      filename,
      contentType: filename.endsWith('.vcf') ? 'text/vcard' : 'text/csv',
    });

describe('import', () => {
  it('imports a CSV, reporting bad rows and skipping duplicates', async () => {
    const { auth } = await createUser();
    await createContact(auth, { name: 'Existing', emails: [{ value: 'exists@x.com' }] });

    const csv = [
      'Full Name,E-mail,Phone,Company,Tags,Birthday',
      'Linus Torvalds,linus@kernel.org,+358 40 1234567,Linux Foundation,oss | kernel,1969-12-28',
      'Dupe,exists@x.com,,,,',
      ',no-name@x.com,,,,',
      'Bad Email,not-an-email,,,,',
      'Margaret Hamilton,work: margaret@nasa.gov | home: mh@mail.com,,NASA,,',
    ].join('\n');

    const res = await upload(auth, csv, 'contacts.csv').expect(200);
    assert.equal(res.body.data.format, 'csv');
    assert.equal(res.body.data.imported, 2);
    assert.equal(res.body.data.skipped, 1);
    assert.equal(res.body.data.failed, 2);
    assert.deepEqual(
      res.body.data.errors.map((e) => e.row),
      [4, 5]
    );

    const list = await api().get('/api/v1/contacts').query({ q: 'margaret' }).set(auth).expect(200);
    assert.deepEqual(list.body.data[0].emails, [
      { label: 'work', value: 'margaret@nasa.gov' },
      { label: 'home', value: 'mh@mail.com' },
    ]);
  });

  it('imports duplicates when skipDuplicates=false', async () => {
    const { auth } = await createUser();
    await createContact(auth, { emails: [{ value: 'a@x.com' }] });
    const res = await upload(auth, 'Name,Email\nA,a@x.com', 'c.csv', { skipDuplicates: 'false' }).expect(200);
    assert.equal(res.body.data.imported, 1);
  });

  it('imports a vCard file', async () => {
    const { auth } = await createUser();
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Tim Berners-Lee',
      'N:Berners-Lee;Tim;;;',
      'ORG:W3C',
      'item1.EMAIL;TYPE=INTERNET,WORK:tim@w3.org',
      'TEL;TYPE=CELL:+44 20 7946 0001',
      'BDAY:19550608',
      'NOTE:Invented the\\nWeb',
      'END:VCARD',
    ].join('\r\n');

    const res = await upload(auth, vcf, 'tim.vcf').expect(200);
    assert.equal(res.body.data.imported, 1);

    const list = await api().get('/api/v1/contacts').set(auth).expect(200);
    const c = list.body.data[0];
    assert.equal(c.name, 'Tim Berners-Lee');
    assert.deepEqual(c.emails, [{ label: 'work', value: 'tim@w3.org' }]);
    assert.equal(c.notes, 'Invented the\nWeb');
    assert.equal(c.birthday.slice(0, 10), '1955-06-08');
  });

  it('rejects an empty file', async () => {
    const { auth } = await createUser();
    await upload(auth, 'Name,Email\n', 'empty.csv').expect(400);
  });

  it('requires a file', async () => {
    const { auth } = await createUser();
    await api().post('/api/v1/contacts/import').set(auth).expect(400);
  });
});

describe('export', () => {
  it('exports CSV that can be imported again', async () => {
    const source = await createUser();
    await createContact(source.auth, {
      name: 'Ada Lovelace',
      emails: [{ label: 'work', value: 'ada@engine.org' }],
      tags: ['math', 'poetry'],
      notes: 'Line one, "quoted"\nLine two',
      birthday: '1815-12-10',
    });

    const res = await api()
      .get('/api/v1/contacts/export')
      .query({ format: 'csv' })
      .set(source.auth)
      .expect(200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(
      res.headers['content-disposition'],
      /attachment; filename="?contacts-\d{4}-\d{2}-\d{2}\.csv/
    );

    const target = await createUser();
    const imported = await upload(target.auth, res.text, 'back.csv').expect(200);
    assert.equal(imported.body.data.imported, 1);

    const list = await api().get('/api/v1/contacts').set(target.auth).expect(200);
    const c = list.body.data[0];
    assert.deepEqual(c.tags, ['math', 'poetry']);
    assert.equal(c.notes, 'Line one, "quoted"\nLine two');
    assert.deepEqual(c.emails, [{ label: 'work', value: 'ada@engine.org' }]);
  });

  it('exports vCard that can be imported again', async () => {
    const source = await createUser();
    await createContact(source.auth, {
      name: 'Hedy Lamarr',
      company: 'MGM; Inventions, Inc.',
      phones: [{ label: 'mobile', value: '+1 555 0100' }],
      addresses: [{ label: 'home', city: 'Vienna', country: 'Austria' }],
    });

    const res = await api()
      .get('/api/v1/contacts/export')
      .query({ format: 'vcf' })
      .set(source.auth)
      .expect(200);
    assert.match(res.text, /BEGIN:VCARD/);
    assert.match(res.text, /ORG:MGM\\; Inventions\\, Inc\./);

    const target = await createUser();
    await upload(target.auth, res.text, 'back.vcf').expect(200);
    const list = await api().get('/api/v1/contacts').set(target.auth).expect(200);
    const c = list.body.data[0];
    assert.equal(c.company, 'MGM; Inventions, Inc.');
    assert.equal(c.addresses[0].city, 'Vienna');
  });
});
