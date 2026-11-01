const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toVcard, fromVcard } = require('../../src/modules/contacts/formats/vcard');
const { toCsv, fromCsv } = require('../../src/modules/contacts/formats/csv');

const sample = {
  name: 'José Ñúñez',
  company: 'Acme; Sons, Ltd',
  jobTitle: 'CTO',
  emails: [{ label: 'work', value: 'jose@acme.com' }],
  phones: [
    { label: 'mobile', value: '+34 600 000 000' },
    { label: 'home', value: '91 000 0000' },
  ],
  addresses: [{ label: 'work', street: 'Calle Mayor 1', city: 'Madrid', country: 'Spain' }],
  website: 'https://acme.com',
  birthday: new Date('1980-02-29T00:00:00Z'),
  tags: ['client', 'spain'],
  notes: 'Multi-line\nnote with, commas; and semicolons \\ backslash. '.repeat(3),
};

describe('vCard', () => {
  it('round-trips every supported field', () => {
    const [parsed] = fromVcard(toVcard([sample]));
    assert.equal(parsed.name, sample.name);
    assert.equal(parsed.company, sample.company);
    assert.equal(parsed.jobTitle, 'CTO');
    assert.deepEqual(parsed.emails, sample.emails);
    assert.deepEqual(parsed.phones, sample.phones);
    assert.deepEqual(parsed.addresses, [
      { label: 'work', street: 'Calle Mayor 1', city: 'Madrid', country: 'Spain' },
    ]);
    assert.equal(parsed.website, sample.website);
    assert.equal(parsed.birthday, '1980-02-29');
    assert.deepEqual(parsed.tags, sample.tags);
    assert.equal(parsed.notes, sample.notes);
  });

  it('folds long lines at 75 octets', () => {
    const out = toVcard([sample]);
    for (const line of out.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  });

  it('reads multiple cards, group prefixes and N fallback', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N:Doe;John;;;',
      'item1.TEL;CELL:555-1234',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Second',
      'EMAIL;TYPE=INTERNET;TYPE=HOME:s@x.com',
      'END:VCARD',
    ].join('\n');
    const cards = fromVcard(text);
    assert.equal(cards.length, 2);
    assert.equal(cards[0].name, 'John Doe');
    assert.deepEqual(cards[0].phones, [{ label: 'cell', value: '555-1234' }]);
    assert.deepEqual(cards[1].emails, [{ label: 'home', value: 's@x.com' }]);
  });
});

describe('CSV', () => {
  it('round-trips the main fields', () => {
    const [parsed] = fromCsv(toCsv([{ ...sample, isFavorite: true }]));
    assert.equal(parsed.name, sample.name);
    assert.deepEqual(parsed.emails, sample.emails);
    assert.deepEqual(parsed.phones, sample.phones);
    assert.equal(parsed.addresses[0].city, 'Madrid');
    assert.equal(parsed.birthday, '1980-02-29');
    assert.deepEqual(parsed.tags, sample.tags);
    assert.equal(parsed.notes, sample.notes);
    assert.equal(parsed.isFavorite, true);
  });

  it('understands common header names from other tools', () => {
    const [row] = fromCsv(
      'First Name,Last Name,E-mail Address,Mobile,Organization\nAda,Lovelace,ada@x.com,123456,Engines'
    );
    assert.equal(row.name, 'Ada Lovelace');
    assert.deepEqual(row.emails, [{ value: 'ada@x.com' }]);
    assert.deepEqual(row.phones, [{ value: '123456' }]);
    assert.equal(row.company, 'Engines');
  });

  it('ignores unknown columns', () => {
    const [row] = fromCsv('Name,Shoe Size\nAda,38');
    assert.deepEqual(row, { name: 'Ada' });
  });
});
