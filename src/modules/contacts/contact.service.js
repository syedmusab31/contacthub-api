const Contact = require('./contact.model');
const Group = require('../groups/group.model');
const User = require('../users/user.model');
const audit = require('../audit/audit.service');
const storage = require('../../services/storage');
const queue = require('../../jobs/queue');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const { escapeRegex, normalizePhone, paginationMeta } = require('../../utils/helpers');

const SORTS = {
  name: { name: 1 },
  '-name': { name: -1 },
  createdAt: { createdAt: 1 },
  '-createdAt': { createdAt: -1 },
  updatedAt: { updatedAt: 1 },
  '-updatedAt': { updatedAt: -1 },
  birthday: { birthday: 1 },
};

// Fields a shared "editor" may change. Groups and favourites belong to the owner.
const EDITOR_FIELDS = [
  'name',
  'company',
  'jobTitle',
  'emails',
  'phones',
  'addresses',
  'socialLinks',
  'website',
  'birthday',
  'notes',
  'tags',
];
const AUDITED_FIELDS = [...EDITOR_FIELDS, 'groups', 'isFavorite'];

const roleOf = (contact, userId) => {
  if (contact.owner.equals(userId)) return 'owner';
  return contact.sharedWith.find((s) => s.user.equals(userId))?.role || null;
};

/** JSON for the API. People a contact is shared with don't see the owner's private fields. */
function serialize(contact, userId) {
  const json = contact.toJSON();
  const role = roleOf(contact, userId);
  json.access = role;
  if (role !== 'owner') {
    delete json.sharedWith;
    delete json.groups;
    delete json.isFavorite;
  }
  return json;
}

function snapshot(contact) {
  const obj = contact.toObject({ depopulate: true });
  const out = {};
  for (const key of AUDITED_FIELDS) {
    let value = obj[key];
    if (key === 'phones') value = value?.map(({ label, value: v }) => ({ label, value: v }));
    if (key === 'groups') value = value?.map(String);
    out[key] = value;
  }
  return out;
}

/**
 * Load an active contact the user can reach and check their role.
 * `need`: 'view' | 'edit' | 'owner'
 */
async function findAccessible(userId, id, need = 'view') {
  const contact = await Contact.findOne({
    _id: id,
    deletedAt: null,
    $or: [{ owner: userId }, { 'sharedWith.user': userId }],
  });
  if (!contact) throw AppError.notFound('Contact not found');

  const role = roleOf(contact, userId);
  if (need === 'owner' && role !== 'owner') throw AppError.forbidden('Only the owner can do this');
  if (need === 'edit' && role === 'viewer')
    throw AppError.forbidden('You have view-only access to this contact');
  return { contact, role };
}

async function assertGroupsOwned(ownerId, groupIds = []) {
  const unique = [...new Set(groupIds.map(String))];
  if (!unique.length) return unique;
  const count = await Group.countDocuments({ _id: { $in: unique }, owner: ownerId });
  if (count !== unique.length) {
    throw AppError.validation([{ path: 'groups', message: 'One or more groups do not exist' }]);
  }
  return unique;
}

/** Active contacts of the owner that share an email or phone with `data`. */
async function findPotentialDuplicates(ownerId, data, excludeId) {
  const emails = (data.emails || []).map((e) => e.value.toLowerCase());
  const phones = (data.phones || []).map((p) => normalizePhone(p.value)).filter((p) => p.length >= 5);
  if (!emails.length && !phones.length) return [];

  const or = [];
  if (emails.length) or.push({ 'emails.value': { $in: emails } });
  if (phones.length) or.push({ 'phones.normalized': { $in: phones } });

  const filter = { owner: ownerId, deletedAt: null, $or: or };
  if (excludeId) filter._id = { $ne: excludeId };
  const matches = await Contact.find(filter).select('name').limit(10);
  return matches.map((m) => ({ id: m.id, name: m.name }));
}

async function list(userId, { page, limit, q, tag, group, favorite, sort }) {
  const filter = { owner: userId, deletedAt: null };
  if (tag) filter.tags = tag;
  if (group) filter.groups = group;
  if (favorite !== undefined) filter.isFavorite = favorite;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    const or = [
      { name: pattern },
      { company: pattern },
      { 'emails.value': pattern },
      { tags: q.toLowerCase() },
    ];
    const digits = normalizePhone(q);
    if (digits.replace('+', '').length >= 3) {
      or.push({ 'phones.normalized': new RegExp(escapeRegex(digits.replace('+', ''))) });
    }
    filter.$or = or;
  }

  const [items, total] = await Promise.all([
    Contact.find(filter)
      .collation({ locale: 'en', strength: 2 })
      .sort({ isFavorite: -1, ...SORTS[sort], _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Contact.countDocuments(filter),
  ]);

  return { items: items.map((c) => serialize(c, userId)), meta: paginationMeta(page, limit, total) };
}

async function create(userId, data, context) {
  data.groups = await assertGroupsOwned(userId, data.groups);
  const duplicates = await findPotentialDuplicates(userId, data);
  const contact = await Contact.create({ ...data, owner: userId });

  await audit.record({
    actor: userId,
    action: 'contact.created',
    entityType: 'contact',
    entityId: contact._id,
    context,
  });
  return { contact: serialize(contact, userId), duplicates };
}

async function get(userId, id) {
  const { contact } = await findAccessible(userId, id, 'view');
  return serialize(contact, userId);
}

async function update(userId, id, data, context) {
  const { contact, role } = await findAccessible(userId, id, 'edit');

  const allowed = role === 'owner' ? AUDITED_FIELDS : EDITOR_FIELDS;
  const blocked = Object.keys(data).filter((k) => data[k] !== undefined && !allowed.includes(k));
  if (blocked.length) throw AppError.forbidden(`Editors cannot change: ${blocked.join(', ')}`);

  if (data.groups) data.groups = await assertGroupsOwned(contact.owner, data.groups);

  const before = snapshot(contact);
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) contact.set(key, value === '' ? undefined : value);
  }
  await contact.save();

  const changes = audit.diff(before, snapshot(contact));
  if (changes) {
    await audit.record({
      actor: userId,
      action: 'contact.updated',
      entityType: 'contact',
      entityId: contact._id,
      changes,
      context,
    });
  }
  return serialize(contact, userId);
}

async function softDelete(userId, id, context) {
  const { contact } = await findAccessible(userId, id, 'owner');
  contact.deletedAt = new Date();
  await contact.save();
  await audit.record({
    actor: userId,
    action: 'contact.deleted',
    entityType: 'contact',
    entityId: contact._id,
    context,
  });
}

async function listTrash(userId, { page, limit }) {
  const filter = { owner: userId, deletedAt: { $ne: null } };
  const [items, total] = await Promise.all([
    Contact.find(filter)
      .sort({ deletedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Contact.countDocuments(filter),
  ]);
  const retentionMs = env.TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return {
    items: items.map((c) => ({
      ...serialize(c, userId),
      purgeAt: new Date(c.deletedAt.getTime() + retentionMs),
    })),
    meta: paginationMeta(page, limit, total),
  };
}

async function findInTrash(userId, id) {
  const contact = await Contact.findOne({ _id: id, owner: userId, deletedAt: { $ne: null } });
  if (!contact) throw AppError.notFound('Contact not found in trash');
  return contact;
}

async function restore(userId, id, context) {
  const contact = await findInTrash(userId, id);
  contact.deletedAt = null;
  await contact.save();
  await audit.record({
    actor: userId,
    action: 'contact.restored',
    entityType: 'contact',
    entityId: contact._id,
    context,
  });
  return serialize(contact, userId);
}

async function destroy(userId, id, context) {
  const contact = await findInTrash(userId, id);
  await storage.remove(contact.avatar?.key);
  await contact.deleteOne();
  await audit.record({
    actor: userId,
    action: 'contact.purged',
    entityType: 'contact',
    entityId: contact._id,
    context,
  });
}

async function emptyTrash(userId) {
  const contacts = await Contact.find({ owner: userId, deletedAt: { $ne: null } }).select('avatar');
  await Promise.all(contacts.map((c) => storage.remove(c.avatar?.key)));
  const { deletedCount } = await Contact.deleteMany({ _id: { $in: contacts.map((c) => c._id) } });
  return { deletedCount };
}

async function listTags(userId) {
  const rows = await Contact.aggregate([
    { $match: { owner: userId, deletedAt: null } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  return rows.map((r) => ({ tag: r._id, count: r.count }));
}

/** Next occurrence of a birthday on or after `from` (UTC). Feb 29 falls back to Feb 28. */
function nextBirthday(birthday, from) {
  const month = birthday.getUTCMonth();
  const day = birthday.getUTCDate();
  const build = (year) => {
    const isLeap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
    return new Date(Date.UTC(year, month, month === 1 && day === 29 && !isLeap ? 28 : day));
  };
  let next = build(from.getUTCFullYear());
  if (next < from) next = build(from.getUTCFullYear() + 1);
  return next;
}

async function upcomingBirthdays(userId, { days }) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const contacts = await Contact.find({ owner: userId, deletedAt: null, birthday: { $ne: null } }).select(
    'name birthday avatar'
  );

  return contacts
    .map((c) => {
      const next = nextBirthday(c.birthday, today);
      const daysUntil = Math.round((next - today) / 86_400_000);
      const birthYear = c.birthday.getUTCFullYear();
      return {
        id: c.id,
        name: c.name,
        avatar: c.avatar?.url,
        birthday: c.birthday,
        nextBirthday: next,
        daysUntil,
        turningAge: birthYear > 1900 ? next.getUTCFullYear() - birthYear : undefined,
      };
    })
    .filter((c) => c.daysUntil <= days)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
}

// ---- Sharing ----------------------------------------------------------------

async function share(owner, id, { email, role }, context) {
  const { contact } = await findAccessible(owner._id, id, 'owner');
  const recipient = await User.findOne({ email });
  if (!recipient) throw AppError.notFound('No user is registered with that email');
  if (recipient._id.equals(owner._id)) throw AppError.badRequest('You cannot share a contact with yourself');

  const existing = contact.sharedWith.find((s) => s.user.equals(recipient._id));
  if (existing) existing.role = role;
  else contact.sharedWith.push({ user: recipient._id, role });
  await contact.save();

  await audit.record({
    actor: owner._id,
    action: 'contact.shared',
    entityType: 'contact',
    entityId: contact._id,
    metadata: { with: recipient._id, role },
    context,
  });
  if (!existing) {
    await queue.enqueue('send-email', {
      to: recipient.email,
      template: 'contactShared',
      params: { recipientName: recipient.name, ownerName: owner.name, contactName: contact.name, role },
    });
  }

  await contact.populate('sharedWith.user', 'name email');
  return contact.sharedWith.map((s) => ({
    user: { id: s.user.id, name: s.user.name, email: s.user.email },
    role: s.role,
    sharedAt: s.sharedAt,
  }));
}

/** The owner can remove anyone; someone a contact was shared with can remove themselves. */
async function unshare(userId, id, targetUserId, context) {
  const { contact, role } = await findAccessible(userId, id, 'view');
  if (role !== 'owner' && String(userId) !== String(targetUserId)) {
    throw AppError.forbidden('Only the owner can remove other people');
  }
  const before = contact.sharedWith.length;
  contact.sharedWith = contact.sharedWith.filter((s) => String(s.user) !== String(targetUserId));
  if (contact.sharedWith.length === before) throw AppError.notFound('Contact is not shared with that user');
  await contact.save();

  await audit.record({
    actor: userId,
    action: 'contact.unshared',
    entityType: 'contact',
    entityId: contact._id,
    metadata: { with: targetUserId },
    context,
  });
}

async function listSharedWithMe(userId, { page, limit }) {
  const filter = { 'sharedWith.user': userId, deletedAt: null };
  const [items, total] = await Promise.all([
    Contact.find(filter)
      .populate('owner', 'name email')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Contact.countDocuments(filter),
  ]);
  return {
    items: items.map((c) => {
      const owner = { id: c.owner.id, name: c.owner.name, email: c.owner.email };
      c.depopulate('owner');
      return { ...serialize(c, userId), owner };
    }),
    meta: paginationMeta(page, limit, total),
  };
}

// ---- Avatar -----------------------------------------------------------------

async function setAvatar(userId, id, file) {
  const { contact } = await findAccessible(userId, id, 'edit');
  const previous = contact.avatar?.key;
  contact.avatar = await storage.save(file, `avatars/contacts/${contact.owner}`);
  await contact.save();
  await storage.remove(previous);
  return serialize(contact, userId);
}

async function removeAvatar(userId, id) {
  const { contact } = await findAccessible(userId, id, 'edit');
  await storage.remove(contact.avatar?.key);
  contact.avatar = undefined;
  await contact.save();
  return serialize(contact, userId);
}

// ---- History ----------------------------------------------------------------

async function history(userId, id, pageOpts) {
  await findAccessible(userId, id, 'owner');
  return audit.list({ entityType: 'contact', entityId: id }, pageOpts);
}

module.exports = {
  findAccessible,
  findPotentialDuplicates,
  serialize,
  list,
  create,
  get,
  update,
  softDelete,
  listTrash,
  restore,
  destroy,
  emptyTrash,
  listTags,
  upcomingBirthdays,
  nextBirthday,
  share,
  unshare,
  listSharedWithMe,
  setAvatar,
  removeAvatar,
  history,
};
