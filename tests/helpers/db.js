const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo;

async function connect() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // Build indexes up front so unique constraints behave like production.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

async function clear() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

async function close() {
  await mongoose.disconnect();
  await mongo?.stop();
}

module.exports = { connect, clear, close };
