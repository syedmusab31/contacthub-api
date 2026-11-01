const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

/**
 * CSV layout. Multi-value cells (emails, phones, tags) are separated by " | "
 * and may carry a label: "work: jane@acme.com | home: jane@mail.com".
 */
const COLUMNS = [
  'Name',
  'Company',
  'Job Title',
  'Emails',
  'Phones',
  'Street',
  'City',
  'State',
  'Postal Code',
  'Country',
  'Website',
  'Birthday',
  'Tags',
  'Notes',
  'Favorite',
];

const SEP = ' | ';

const joinLabeled = (items = []) =>
  items.map((i) => (i.label ? `${i.label}: ${i.value}` : i.value)).join(SEP);

function splitLabeled(cell) {
  if (!cell) return [];
  return String(cell)
    .split(/\s*[|;]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([A-Za-z][\w -]{0,29}):\s*(.+)$/);
      return match ? { label: match[1].trim().toLowerCase(), value: match[2].trim() } : { value: part };
    });
}

const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function toCsv(contacts) {
  const rows = contacts.map((c) => {
    const address = c.addresses?.[0] || {};
    return [
      c.name,
      c.company || '',
      c.jobTitle || '',
      joinLabeled(c.emails),
      joinLabeled(c.phones),
      address.street || '',
      address.city || '',
      address.state || '',
      address.postalCode || '',
      address.country || '',
      c.website || '',
      isoDate(c.birthday),
      (c.tags || []).join(SEP),
      c.notes || '',
      c.isFavorite ? 'yes' : '',
    ];
  });
  return stringify([COLUMNS, ...rows]);
}

// Header aliases so files exported from other tools mostly just work.
const ALIASES = {
  name: ['name', 'full name', 'display name'],
  firstName: ['first name', 'given name'],
  lastName: ['last name', 'family name', 'surname'],
  company: ['company', 'organization', 'organisation', 'organization name'],
  jobTitle: ['job title', 'title', 'organization title'],
  emails: ['emails', 'email', 'e-mail', 'email address', 'e-mail address'],
  phones: ['phones', 'phone', 'mobile', 'phone number', 'telephone'],
  street: ['street', 'address', 'street address'],
  city: ['city'],
  state: ['state', 'region', 'province'],
  postalCode: ['postal code', 'zip', 'zip code', 'postcode'],
  country: ['country'],
  website: ['website', 'url', 'web page'],
  birthday: ['birthday', 'birth date', 'date of birth', 'dob'],
  tags: ['tags', 'labels', 'categories'],
  notes: ['notes', 'note'],
  isFavorite: ['favorite', 'favourite', 'starred'],
};

const lookup = new Map(Object.entries(ALIASES).flatMap(([field, names]) => names.map((n) => [n, field])));

const clean = (obj) => {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete obj[key];
  }
  return obj;
};

/** Parse CSV text into plain contact objects (not yet validated). */
function fromCsv(text) {
  const records = parse(text, {
    columns: (header) => header.map((h) => lookup.get(String(h).trim().toLowerCase()) || null),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  return records.map((r) => {
    const address = clean({
      street: r.street,
      city: r.city,
      state: r.state,
      postalCode: r.postalCode,
      country: r.country,
    });
    return clean({
      name: r.name || [r.firstName, r.lastName].filter(Boolean).join(' ') || undefined,
      company: r.company,
      jobTitle: r.jobTitle,
      emails: splitLabeled(r.emails),
      phones: splitLabeled(r.phones),
      addresses: Object.keys(address).length ? [address] : undefined,
      website: r.website,
      birthday: r.birthday || undefined,
      tags: r.tags
        ? String(r.tags)
            .split(/\s*[|;,]\s*/)
            .filter(Boolean)
        : undefined,
      notes: r.notes,
      isFavorite: r.isFavorite
        ? ['yes', 'true', '1', 'y', '*'].includes(String(r.isFavorite).toLowerCase())
        : undefined,
    });
  });
}

module.exports = { toCsv, fromCsv, COLUMNS };
