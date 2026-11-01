/**
 * Minimal vCard 3.0 reader/writer (RFC 2426). Covers the fields this API
 * stores; anything else in an imported card is ignored.
 */

const escape = (v = '') =>
  String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const unescape = (v = '') => v.replace(/\\([\\,;nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

/** Fold lines longer than 75 octets, as the spec requires. */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  for (const char of line) {
    const limit = parts.length ? 74 : 75; // continuation lines start with a space
    if (Buffer.byteLength(current + char, 'utf8') > limit) {
      parts.push(current);
      current = '';
    }
    current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const typeParam = (label) => (label ? `;TYPE=${label.replace(/[^\w-]/g, '').toUpperCase()}` : '');

function splitName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { given: parts[0], family: '' };
  return { family: parts.pop(), given: parts.join(' ') };
}

function contactToVcard(c) {
  const { given, family } = splitName(c.name);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escape(c.name)}`,
    `N:${escape(family)};${escape(given)};;;`,
  ];

  if (c.company) lines.push(`ORG:${escape(c.company)}`);
  if (c.jobTitle) lines.push(`TITLE:${escape(c.jobTitle)}`);
  for (const e of c.emails || []) lines.push(`EMAIL;TYPE=INTERNET${typeParam(e.label)}:${escape(e.value)}`);
  for (const p of c.phones || []) lines.push(`TEL${typeParam(p.label)}:${escape(p.value)}`);
  for (const a of c.addresses || []) {
    const parts = ['', '', a.street, a.city, a.state, a.postalCode, a.country].map((v) => escape(v || ''));
    lines.push(`ADR${typeParam(a.label)}:${parts.join(';')}`);
  }
  if (c.website) lines.push(`URL:${c.website}`);
  for (const s of c.socialLinks || []) lines.push(`X-SOCIALPROFILE;TYPE=${escape(s.platform)}:${s.url}`);
  if (c.birthday) lines.push(`BDAY:${new Date(c.birthday).toISOString().slice(0, 10)}`);
  if (c.tags?.length) lines.push(`CATEGORIES:${c.tags.map(escape).join(',')}`);
  if (c.notes) lines.push(`NOTE:${escape(c.notes)}`);
  lines.push('END:VCARD');

  return lines.map(fold).join('\r\n');
}

const toVcard = (contacts) => `${contacts.map(contactToVcard).join('\r\n')}\r\n`;

/** Split on unescaped `sep`. */
function splitEscaped(value, sep) {
  const out = [];
  let current = '';
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '\\' && i + 1 < value.length) {
      current += value[i] + value[i + 1];
      i += 1;
    } else if (value[i] === sep) {
      out.push(current);
      current = '';
    } else {
      current += value[i];
    }
  }
  out.push(current);
  return out;
}

function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [rawName, ...params] = head.split(';');
  const name = rawName.split('.').pop().toUpperCase(); // drop "item1." group prefixes

  const types = [];
  for (const p of params) {
    const [k, v] = p.includes('=') ? p.split('=') : ['TYPE', p];
    if (k.toUpperCase() === 'TYPE') types.push(...v.split(',').map((t) => t.toLowerCase()));
  }
  const label = types.find((t) => !['internet', 'pref', 'voice', 'x400'].includes(t));
  return { name, value, label };
}

function fromVcard(text) {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const cards = [];
  let card = null;

  for (const raw of unfolded.split('\n')) {
    // Only trim the start: trailing spaces can be part of a value.
    const line = raw.trimStart();
    if (!line.trim()) continue;
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      card = { emails: [], phones: [], addresses: [], socialLinks: [], tags: [] };
      continue;
    }
    if (upper === 'END:VCARD') {
      if (card) cards.push(card);
      card = null;
      continue;
    }
    if (!card) continue;

    const prop = parseLine(line);
    if (!prop) continue;
    const { name, value, label } = prop;

    switch (name) {
      case 'FN':
        card.name = unescape(value).trim();
        break;
      case 'N': {
        const [family, given] = splitEscaped(value, ';').map((v) => unescape(v).trim());
        card.nFallback = [given, family].filter(Boolean).join(' ');
        break;
      }
      case 'ORG':
        card.company = unescape(splitEscaped(value, ';')[0]).trim();
        break;
      case 'TITLE':
        card.jobTitle = unescape(value).trim();
        break;
      case 'EMAIL':
        card.emails.push({ label, value: unescape(value).trim() });
        break;
      case 'TEL':
        card.phones.push({ label, value: unescape(value).replace(/^tel:/i, '').trim() });
        break;
      case 'ADR': {
        const [, , street, city, state, postalCode, country] = splitEscaped(value, ';').map((v) =>
          unescape(v).trim()
        );
        card.addresses.push({ label, street, city, state, postalCode, country });
        break;
      }
      case 'URL':
        card.website = unescape(value).trim();
        break;
      case 'X-SOCIALPROFILE':
        card.socialLinks.push({ platform: label || 'other', url: unescape(value).trim() });
        break;
      case 'BDAY': {
        const v = value.trim();
        const compact = v.match(/^(\d{4})(\d{2})(\d{2})$/);
        card.birthday = compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : v.slice(0, 10);
        break;
      }
      case 'CATEGORIES':
        card.tags.push(
          ...splitEscaped(value, ',')
            .map((t) => unescape(t).trim())
            .filter(Boolean)
        );
        break;
      case 'NOTE':
        card.notes = unescape(value);
        break;
      default:
        break;
    }
  }

  return cards.map(({ nFallback, ...c }) => {
    if (!c.name) c.name = nFallback;
    for (const key of Object.keys(c)) {
      const v = c[key];
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete c[key];
    }
    c.addresses = c.addresses
      ?.map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v)))
      .filter((a) => Object.keys(a).some((k) => k !== 'label'));
    if (!c.addresses?.length) delete c.addresses;
    return c;
  });
}

module.exports = { toVcard, fromVcard };
