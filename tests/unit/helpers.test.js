const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, escapeRegex, sha256 } = require('../../src/utils/helpers');
const { clean } = require('../../src/middleware/sanitize');
const { diff } = require('../../src/modules/audit/audit.service');
const { nextBirthday } = require('../../src/modules/contacts/contact.service');

describe('normalizePhone', () => {
  it('keeps a leading plus and digits only', () => {
    assert.equal(normalizePhone('+1 (555) 010-2000'), '+15550102000');
    assert.equal(normalizePhone('0300-1234567'), '03001234567');
  });
});

describe('escapeRegex', () => {
  it('escapes special characters', () => {
    assert.ok(new RegExp(escapeRegex('a.b*')).test('a.b*'));
    assert.ok(!new RegExp(escapeRegex('a.b')).test('axb'));
  });
});

describe('sha256', () => {
  it('is deterministic', () => assert.equal(sha256('x'), sha256('x')));
});

describe('sanitize.clean', () => {
  it('removes operator and dotted keys at any depth', () => {
    assert.deepEqual(clean({ a: { $gt: 1, b: 2 }, 'c.d': 1, list: [{ $where: 'x', ok: true }] }), {
      a: { b: 2 },
      list: [{ ok: true }],
    });
  });
});

describe('audit diff', () => {
  it('reports only changed fields', () => {
    assert.deepEqual(diff({ a: 1, b: [1], updatedAt: 1 }, { a: 1, b: [2], updatedAt: 2 }), {
      b: { from: [1], to: [2] },
    });
    assert.equal(diff({ a: 1 }, { a: 1 }), undefined);
  });
});

describe('nextBirthday', () => {
  const d = (s) => new Date(`${s}T00:00:00Z`);

  it('returns this year when the date has not passed', () => {
    assert.deepEqual(nextBirthday(d('1990-12-25'), d('2026-11-01')), d('2026-12-25'));
  });

  it('rolls over to next year', () => {
    assert.deepEqual(nextBirthday(d('1990-01-10'), d('2026-11-01')), d('2027-01-10'));
  });

  it('counts today as upcoming', () => {
    assert.deepEqual(nextBirthday(d('1990-11-01'), d('2026-11-01')), d('2026-11-01'));
  });

  it('moves Feb 29 to Feb 28 in non-leap years', () => {
    assert.deepEqual(nextBirthday(d('2000-02-29'), d('2027-01-01')), d('2027-02-28'));
    assert.deepEqual(nextBirthday(d('2000-02-29'), d('2028-01-01')), d('2028-02-29'));
  });
});
