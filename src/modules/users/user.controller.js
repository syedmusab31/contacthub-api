const userService = require('./user.service');
const { contextFrom } = require('../audit/audit.service');
const { ok, noContent } = require('../../utils/response');

const getMe = (req, res) => ok(res, { user: req.user });

async function updateMe(req, res) {
  ok(res, { user: await userService.updateProfile(req.user, req.body, contextFrom(req)) });
}

async function changePassword(req, res) {
  const session = await userService.changePassword(req.user._id, req.body, contextFrom(req));
  ok(res, session);
}

async function uploadAvatar(req, res) {
  ok(res, { user: await userService.setAvatar(req.user, req.file) });
}

async function deleteAvatar(req, res) {
  ok(res, { user: await userService.removeAvatar(req.user) });
}

async function deleteMe(req, res) {
  await userService.deleteAccount(req.user._id, req.body);
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  noContent(res);
}

module.exports = { getMe, updateMe, changePassword, uploadAvatar, deleteAvatar, deleteMe };
