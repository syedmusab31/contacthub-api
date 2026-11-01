const groupService = require('./group.service');
const { serialize } = require('../contacts/contact.service');
const { contextFrom } = require('../audit/audit.service');
const { ok, created, noContent } = require('../../utils/response');

const uid = (req) => req.user._id;

const list = async (req, res) => ok(res, await groupService.list(uid(req)));

const create = async (req, res) =>
  created(res, { group: await groupService.create(uid(req), req.body, contextFrom(req)) });

const get = async (req, res) => ok(res, { group: await groupService.get(uid(req), req.params.id) });

const update = async (req, res) =>
  ok(res, { group: await groupService.update(uid(req), req.params.id, req.body, contextFrom(req)) });

async function remove(req, res) {
  await groupService.remove(uid(req), req.params.id, contextFrom(req));
  noContent(res);
}

async function contacts(req, res) {
  const { items, meta } = await groupService.listContacts(uid(req), req.params.id, req.query);
  ok(
    res,
    items.map((c) => serialize(c, uid(req))),
    meta
  );
}

const addContacts = async (req, res) =>
  ok(res, await groupService.addContacts(uid(req), req.params.id, req.body.contactIds));

const removeContacts = async (req, res) =>
  ok(res, await groupService.removeContacts(uid(req), req.params.id, req.body.contactIds));

module.exports = { list, create, get, update, remove, contacts, addContacts, removeContacts };
