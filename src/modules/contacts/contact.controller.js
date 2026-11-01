const contactService = require('./contact.service');
const duplicateService = require('./contact.duplicates.service');
const transferService = require('./contact.transfer.service');
const { contextFrom } = require('../audit/audit.service');
const { ok, created, noContent } = require('../../utils/response');

const uid = (req) => req.user._id;

async function list(req, res) {
  const { items, meta } = await contactService.list(uid(req), req.query);
  ok(res, items, meta);
}

async function create(req, res) {
  const { contact, duplicates } = await contactService.create(uid(req), req.body, contextFrom(req));
  created(res, { contact, possibleDuplicates: duplicates });
}

async function get(req, res) {
  ok(res, { contact: await contactService.get(uid(req), req.params.id) });
}

async function update(req, res) {
  ok(res, { contact: await contactService.update(uid(req), req.params.id, req.body, contextFrom(req)) });
}

async function remove(req, res) {
  await contactService.softDelete(uid(req), req.params.id, contextFrom(req));
  noContent(res);
}

async function trash(req, res) {
  const { items, meta } = await contactService.listTrash(uid(req), req.query);
  ok(res, items, meta);
}

async function restore(req, res) {
  ok(res, { contact: await contactService.restore(uid(req), req.params.id, contextFrom(req)) });
}

async function destroy(req, res) {
  await contactService.destroy(uid(req), req.params.id, contextFrom(req));
  noContent(res);
}

async function emptyTrash(req, res) {
  ok(res, await contactService.emptyTrash(uid(req)));
}

async function tags(req, res) {
  ok(res, await contactService.listTags(uid(req)));
}

async function upcomingBirthdays(req, res) {
  ok(res, await contactService.upcomingBirthdays(uid(req), req.query));
}

async function duplicates(req, res) {
  ok(res, await duplicateService.findDuplicates(uid(req)));
}

async function merge(req, res) {
  ok(res, { contact: await duplicateService.merge(uid(req), req.body, contextFrom(req)) });
}

async function exportContacts(req, res) {
  const file = await transferService.exportContacts(uid(req), req.query);
  res.set('Content-Type', file.contentType);
  res.attachment(file.filename);
  res.send(file.body);
}

async function importContacts(req, res) {
  ok(res, await transferService.importContacts(uid(req), req.file, req.query, contextFrom(req)));
}

async function share(req, res) {
  ok(res, { sharedWith: await contactService.share(req.user, req.params.id, req.body, contextFrom(req)) });
}

async function unshare(req, res) {
  await contactService.unshare(uid(req), req.params.id, req.params.userId, contextFrom(req));
  noContent(res);
}

async function sharedWithMe(req, res) {
  const { items, meta } = await contactService.listSharedWithMe(uid(req), req.query);
  ok(res, items, meta);
}

async function uploadAvatar(req, res) {
  ok(res, { contact: await contactService.setAvatar(uid(req), req.params.id, req.file) });
}

async function deleteAvatar(req, res) {
  ok(res, { contact: await contactService.removeAvatar(uid(req), req.params.id) });
}

async function history(req, res) {
  const { items, meta } = await contactService.history(uid(req), req.params.id, req.query);
  ok(res, items, meta);
}

module.exports = {
  list,
  create,
  get,
  update,
  remove,
  trash,
  restore,
  destroy,
  emptyTrash,
  tags,
  upcomingBirthdays,
  duplicates,
  merge,
  exportContacts,
  importContacts,
  share,
  unshare,
  sharedWithMe,
  uploadAvatar,
  deleteAvatar,
  history,
};
