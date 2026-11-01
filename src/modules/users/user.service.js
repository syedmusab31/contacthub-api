const User = require('./user.model');
const Contact = require('../contacts/contact.model');
const Group = require('../groups/group.model');
const AuditLog = require('../audit/audit.model');
const RefreshToken = require('../auth/refreshToken.model');
const tokenService = require('../auth/token.service');
const audit = require('../audit/audit.service');
const storage = require('../../services/storage');
const queue = require('../../jobs/queue');
const AppError = require('../../utils/AppError');

async function updateProfile(user, { name, preferences }, context) {
  const snapshot = () => {
    const obj = user.toObject();
    return { name: obj.name, preferences: obj.preferences };
  };
  const before = snapshot();
  if (name !== undefined) user.name = name;
  if (preferences) {
    for (const [key, value] of Object.entries(preferences)) {
      if (value !== undefined) user.set(`preferences.${key}`, value);
    }
  }
  await user.save();

  await audit.record({
    actor: user._id,
    action: 'user.updated',
    entityType: 'user',
    entityId: user._id,
    changes: audit.diff(before, snapshot()),
    context,
  });
  return user;
}

/**
 * Change password, sign out every other session and hand back a fresh
 * token pair for the current one.
 */
async function changePassword(userId, { currentPassword, newPassword }, context) {
  const user = await User.findById(userId).select('+password');
  if (user.password) {
    if (!currentPassword)
      throw AppError.validation([{ path: 'currentPassword', message: 'Current password is required' }]);
    if (!(await user.comparePassword(currentPassword))) {
      throw AppError.unauthorized('Current password is incorrect');
    }
    if (await user.comparePassword(newPassword)) {
      throw AppError.badRequest('New password must be different from the current one');
    }
  }

  await user.setPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  await tokenService.revokeAllForUser(user._id);

  await audit.record({
    actor: user._id,
    action: 'user.password_changed',
    entityType: 'user',
    entityId: user._id,
    context,
  });
  await queue.enqueue('send-email', {
    to: user.email,
    template: 'passwordChanged',
    params: { name: user.name },
  });

  return { user, ...(await tokenService.issueTokenPair(user, context)) };
}

async function setAvatar(user, file) {
  const previous = user.avatar?.key;
  user.avatar = await storage.save(file, `avatars/users/${user.id}`);
  await user.save();
  await storage.remove(previous);
  return user;
}

async function removeAvatar(user) {
  await storage.remove(user.avatar?.key);
  user.avatar = undefined;
  await user.save();
  return user;
}

/** Delete the account and everything that belongs to it. */
async function deleteAccount(userId, { password, confirm }) {
  const user = await User.findById(userId).select('+password');
  if (user.password) {
    if (!password || !(await user.comparePassword(password))) {
      throw AppError.unauthorized('Password is incorrect');
    }
  } else if (confirm !== 'DELETE') {
    throw AppError.badRequest('Send { "confirm": "DELETE" } to delete this account');
  }

  const contacts = await Contact.find({ owner: user._id }).select('avatar');
  await Promise.all(contacts.map((c) => storage.remove(c.avatar?.key)));
  await storage.remove(user.avatar?.key);

  await Promise.all([
    Contact.deleteMany({ owner: user._id }),
    Contact.updateMany({ 'sharedWith.user': user._id }, { $pull: { sharedWith: { user: user._id } } }),
    Group.deleteMany({ owner: user._id }),
    RefreshToken.deleteMany({ user: user._id }),
    AuditLog.deleteMany({ actor: user._id }),
  ]);
  await user.deleteOne();
}

module.exports = { updateProfile, changePassword, setAvatar, removeAvatar, deleteAccount };
