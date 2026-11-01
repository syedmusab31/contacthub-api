const multer = require('multer');
const AppError = require('../utils/AppError');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMPORT_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'text/vcard',
  'text/x-vcard',
  'text/directory',
  'text/plain',
  'application/octet-stream',
];

/** Files stay in memory; the storage service decides where they end up. */
function build({ types, maxBytes }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!types.includes(file.mimetype)) {
        return cb(new AppError(`Unsupported file type: ${file.mimetype}`, 415));
      }
      cb(null, true);
    },
  });
}

const requireFile = (req, res, next) => {
  if (!req.file) throw AppError.badRequest('A file is required in the "file" field');
  next();
};

module.exports = {
  imageUpload: [build({ types: IMAGE_TYPES, maxBytes: 2 * 1024 * 1024 }).single('file'), requireFile],
  importUpload: [build({ types: IMPORT_TYPES, maxBytes: 5 * 1024 * 1024 }).single('file'), requireFile],
};
