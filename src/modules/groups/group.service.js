const Group = require('./group.model');
const Contact = require('../contacts/contact.model');
const audit = require('../audit/audit.service');
const AppError = require('../../utils/AppError');
const { paginationMeta } = require('../../utils/helpers');

async function findOwned(userId, id) {
  const group = await Group.findOne({ _id: id, owner: userId });
  if (!group) throw AppError.notFound('Group not found');
  return group;
}

/** Groups with the number of active contacts in each. */
async function list(userId) {
  const [groups, counts] = await Promise.all([
    Group.find({ owner: userId }).collation({ locale: 'en' }).sort({ name: 1 }),
    Contact.aggregate([
      { $match: { owner: userId, deletedAt: null } },
      { $unwind: '$groups' },
      { $group: { _id: '$groups', count: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  return groups.map((g) => ({ ...g.toJSON(), contactCount: byId.get(g.id) || 0 }));
}

async function create(userId, data, context) {
  const group = await Group.create({ ...data, owner: userId });
  await audit.record({
    actor: userId,
    action: 'group.created',
    entityType: 'group',
    entityId: group._id,
    context,
  });
  return group;
}

async function get(userId, id) {
  const group = await findOwned(userId, id);
  const contactCount = await Contact.countDocuments({ owner: userId, groups: group._id, deletedAt: null });
  return { ...group.toJSON(), contactCount };
}

async function update(userId, id, data, context) {
  const group = await findOwned(userId, id);
  const before = group.toObject();
  for (const [key, value] of Object.entries(data)) if (value !== undefined) group[key] = value;
  await group.save();
  await audit.record({
    actor: userId,
    action: 'group.updated',
    entityType: 'group',
    entityId: group._id,
    changes: audit.diff(
      { name: before.name, description: before.description, color: before.color },
      { name: group.name, description: group.description, color: group.color }
    ),
    context,
  });
  return group;
}

/** Deleting a group keeps its contacts; they just lose the membership. */
async function remove(userId, id, context) {
  const group = await findOwned(userId, id);
  await Contact.updateMany({ owner: userId, groups: group._id }, { $pull: { groups: group._id } });
  await group.deleteOne();
  await audit.record({
    actor: userId,
    action: 'group.deleted',
    entityType: 'group',
    entityId: group._id,
    context,
  });
}

async function listContacts(userId, id, { page, limit }) {
  const group = await findOwned(userId, id);
  const filter = { owner: userId, groups: group._id, deletedAt: null };
  const [items, total] = await Promise.all([
    Contact.find(filter)
      .collation({ locale: 'en' })
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Contact.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(page, limit, total) };
}

async function addContacts(userId, id, contactIds) {
  const group = await findOwned(userId, id);
  const { matchedCount, modifiedCount } = await Contact.updateMany(
    { _id: { $in: contactIds }, owner: userId, deletedAt: null },
    { $addToSet: { groups: group._id } }
  );
  return { matched: matchedCount, added: modifiedCount };
}

async function removeContacts(userId, id, contactIds) {
  const group = await findOwned(userId, id);
  const { modifiedCount } = await Contact.updateMany(
    { _id: { $in: contactIds }, owner: userId },
    { $pull: { groups: group._id } }
  );
  return { removed: modifiedCount };
}

module.exports = { list, create, get, update, remove, listContacts, addContacts, removeContacts };
