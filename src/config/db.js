const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);

async function connectDatabase(uri = env.MONGODB_URI) {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const { host, name } = mongoose.connection;
  logger.info({ host, db: name }, 'MongoDB connected');
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close();
}

const isDatabaseReady = () => mongoose.connection.readyState === 1;

module.exports = { connectDatabase, disconnectDatabase, isDatabaseReady };
