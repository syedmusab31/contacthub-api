const Contact = require('./contact.model');
const audit = require('../audit/audit.service');
const AppError = require('../../utils/AppError');
const { serialize } = require('./contact.service');

const SCAN_LIMIT = 10_000;
const ROLE_RANK = { viewer: 1, editor: 2 };

/**
 * Group the owner's contacts into clusters that share an email address, a
 * phone number or an identical name. Uses union-find so A~B and B~C end up
 * in the same cluster even if A and C share nothing directly.
 */
async function findDuplicates(userId) {
  const contacts = await Contact.find({ owner: userId, deletedAt: null })
    .select('name company emails phones avatar updatedAt owner sharedWith')
    .limit(SCAN_LIMIT);

  const parent = contacts.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  const seen = new Map(); // key -> first index
  const reasons = new Map(); // index -> Set of keys
  const link = (key, i) => {
    if (seen.has(key)) {
      union(i, seen.get(key));
      reasons.set(i, (reasons.get(i) || new Set()).add(key));
      reasons.set(seen.get(key), (reasons.get(seen.get(key)) || new Set()).add(key));
    } else {
      seen.set(key, i);
    }
  };

  contacts.forEach((c, i) => {
    link(`name:${c.name.trim().toLowerCase()}`, i);
    c.emails.forEach((e) => link(`email:${e.value}`, i));
    c.phones.forEach((p) => p.normalized?.length >= 5 && link(`phone:${p.normalized}`, i));
  });

  const clusters = new Map();
  contacts.forEach((c, i) => {
    if (!reasons.has(i)) return;
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, { matchedOn: new Set(), contacts: [] });
    const cluster = clusters.get(root);
    cluster.contacts.push(serialize(c, userId));
    reasons.get(i).forEach((r) => cluster.matchedOn.add(r));
  });

  return [...clusters.values()]
    .filter((c) => c.contacts.length > 1)
    .map((c) => ({ matchedOn: [...c.matchedOn], contacts: c.contacts }));
}

const uniqueBy = (items, keyFn) => {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
};

/**
 * Merge duplicates into the primary contact. List fields are unioned, empty
 * scalar fields are filled in, notes are concatenated. Duplicates go to the
 * trash so the merge can be undone by restoring them.
 */
async function merge(userId, { primaryId, duplicateIds }, context) {
  const ids = [...new Set(duplicateIds.map(String))].filter((id) => id !== String(primaryId));
  if (!ids.length) throw AppError.badRequest('Provide at least one duplicate different from the primary');

  const [primary, duplicates] = await Promise.all([
    Contact.findOne({ _id: primaryId, owner: userId, deletedAt: null }),
    Contact.find({ _id: { $in: ids }, owner: userId, deletedAt: null }),
  ]);
  if (!primary) throw AppError.notFound('Primary contact not found');
  if (duplicates.length !== ids.length) throw AppError.notFound('One or more duplicates were not found');

  const all = [primary, ...duplicates];
  const plain = all.map((c) => c.toObject());

  primary.emails = uniqueBy(
    plain.flatMap((c) => c.emails),
    (e) => e.value
  );
  primary.phones = uniqueBy(
    plain.flatMap((c) => c.phones),
    (p) => p.normalized || p.value
  );
  primary.addresses = uniqueBy(
    plain.flatMap((c) => c.addresses),
    (a) =>
      JSON.stringify([a.street, a.city, a.state, a.postalCode, a.country].map((v) => (v || '').toLowerCase()))
  );
  primary.socialLinks = uniqueBy(
    plain.flatMap((c) => c.socialLinks),
    (s) => s.url.toLowerCase()
  );
  primary.tags = [...new Set(plain.flatMap((c) => c.tags))];
  primary.groups = [...new Set(plain.flatMap((c) => c.groups.map(String)))];
  primary.isFavorite = plain.some((c) => c.isFavorite);

  for (const field of ['company', 'jobTitle', 'website', 'birthday']) {
    if (!primary[field]) primary[field] = duplicates.find((d) => d[field])?.[field];
  }
  if (!primary.avatar?.url) {
    const withAvatar = duplicates.find((d) => d.avatar?.url);
    if (withAvatar) {
      primary.avatar = withAvatar.avatar;
      withAvatar.avatar = undefined; // so purging the duplicate doesn't delete the file
    }
  }

  const notes = [...new Set(plain.map((c) => c.notes?.trim()).filter(Boolean))];
  primary.notes = notes.join('\n\n---\n\n').slice(0, 5000) || undefined;

  const shares = new Map();
  for (const s of plain.flatMap((c) => c.sharedWith)) {
    const key = String(s.user);
    if (!shares.has(key) || ROLE_RANK[s.role] > ROLE_RANK[shares.get(key).role]) shares.set(key, s);
  }
  primary.sharedWith = [...shares.values()];

  await primary.save();
  const now = new Date();
  for (const dup of duplicates) {
    dup.deletedAt = now;
    await dup.save();
  }

  await audit.record({
    actor: userId,
    action: 'contact.merged',
    entityType: 'contact',
    entityId: primary._id,
    metadata: { mergedIds: ids },
    context,
  });
  return serialize(primary, userId);
}

module.exports = { findDuplicates, merge };
