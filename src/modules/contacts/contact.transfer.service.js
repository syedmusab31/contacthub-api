const Contact = require('./contact.model');
const audit = require('../audit/audit.service');
const { importRow } = require('./contact.validation');
const { toCsv, fromCsv } = require('./formats/csv');
const { toVcard, fromVcard } = require('./formats/vcard');
const AppError = require('../../utils/AppError');
const { normalizePhone } = require('../../utils/helpers');

const MAX_IMPORT_ROWS = 5000;

async function exportContacts(userId, { format, tag, group, favorite }) {
  const filter = { owner: userId, deletedAt: null };
  if (tag) filter.tags = tag;
  if (group) filter.groups = group;
  if (favorite !== undefined) filter.isFavorite = favorite;

  const contacts = await Contact.find(filter).collation({ locale: 'en' }).sort({ name: 1 }).lean();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'vcf') {
    return {
      body: toVcard(contacts),
      contentType: 'text/vcard; charset=utf-8',
      filename: `contacts-${stamp}.vcf`,
    };
  }
  return { body: toCsv(contacts), contentType: 'text/csv; charset=utf-8', filename: `contacts-${stamp}.csv` };
}

function detectFormat(file, explicit) {
  if (explicit) return explicit;
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.vcf') || name.endsWith('.vcard') || /vcard|directory/.test(file.mimetype)) return 'vcf';
  if (name.endsWith('.csv') || file.mimetype === 'text/csv') return 'csv';
  return file.buffer.toString('utf8', 0, 200).toUpperCase().includes('BEGIN:VCARD') ? 'vcf' : 'csv';
}

/**
 * Import a CSV or vCard file. Each row is validated on its own; bad rows are
 * reported back instead of failing the whole file. With skipDuplicates, rows
 * whose email/phone already exists (in the account or earlier in the file)
 * are skipped.
 */
async function importContacts(userId, file, { format, skipDuplicates }, context) {
  const kind = detectFormat(file, format);
  const text = file.buffer.toString('utf8');

  let rows;
  try {
    rows = kind === 'vcf' ? fromVcard(text) : fromCsv(text);
  } catch (err) {
    throw AppError.badRequest(`Could not read the ${kind.toUpperCase()} file: ${err.message}`);
  }
  if (!rows.length) throw AppError.badRequest('The file does not contain any contacts');
  if (rows.length > MAX_IMPORT_ROWS)
    throw AppError.badRequest(`A single import is limited to ${MAX_IMPORT_ROWS} contacts`);

  const knownEmails = new Set();
  const knownPhones = new Set();
  if (skipDuplicates) {
    const existing = await Contact.find({ owner: userId, deletedAt: null })
      .select('emails.value phones.normalized')
      .lean();
    for (const c of existing) {
      c.emails.forEach((e) => knownEmails.add(e.value));
      c.phones.forEach((p) => p.normalized && knownPhones.add(p.normalized));
    }
  }

  const docs = [];
  const errors = [];
  let skipped = 0;

  rows.forEach((row, index) => {
    // Row numbers as the user sees them (CSV has a header line).
    const rowNumber = kind === 'csv' ? index + 2 : index + 1;
    const result = importRow.safeParse(row);
    if (!result.success) {
      errors.push({
        row: rowNumber,
        messages: result.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`),
      });
      return;
    }
    const data = result.data;
    const emails = (data.emails || []).map((e) => e.value);
    const phones = (data.phones || []).map((p) => normalizePhone(p.value)).filter((p) => p.length >= 5);

    if (
      skipDuplicates &&
      (emails.some((e) => knownEmails.has(e)) || phones.some((p) => knownPhones.has(p)))
    ) {
      skipped += 1;
      return;
    }
    emails.forEach((e) => knownEmails.add(e));
    phones.forEach((p) => knownPhones.add(p));

    delete data.groups; // group ids from another account mean nothing here
    docs.push({ ...data, owner: userId });
  });

  const inserted = docs.length ? await Contact.create(docs) : [];

  await audit.record({
    actor: userId,
    action: 'contacts.imported',
    entityType: 'user',
    entityId: userId,
    metadata: { format: kind, imported: inserted.length, skipped, failed: errors.length },
    context,
  });

  return {
    format: kind,
    total: rows.length,
    imported: inserted.length,
    skipped,
    failed: errors.length,
    errors: errors.slice(0, 100),
  };
}

module.exports = { exportContacts, importContacts };
