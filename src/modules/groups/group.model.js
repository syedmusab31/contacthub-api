const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300 },
    color: { type: String, trim: true, match: /^#[0-9a-fA-F]{6}$/, default: '#2563eb' },
  },
  { timestamps: true }
);

// Group names are unique per user, ignoring case.
groupSchema.index({ owner: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

groupSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Group', groupSchema);
