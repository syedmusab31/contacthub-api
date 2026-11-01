const mongoose = require('mongoose');
const { normalizePhone } = require('../../utils/helpers');

const { ObjectId } = mongoose.Schema.Types;

const emailSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: 'personal', maxlength: 30 },
    value: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  },
  { _id: false }
);

const phoneSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: 'mobile', maxlength: 30 },
    value: { type: String, required: true, trim: true, maxlength: 30 },
    // Digits-only copy used for duplicate detection and search.
    normalized: { type: String },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: 'home', maxlength: 30 },
    street: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 20 },
    country: { type: String, trim: true, maxlength: 100 },
  },
  { _id: false }
);

const socialSchema = new mongoose.Schema(
  {
    platform: { type: String, trim: true, required: true, maxlength: 30 },
    url: { type: String, trim: true, required: true, maxlength: 500 },
  },
  { _id: false }
);

const shareSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
    sharedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  {
    owner: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    company: { type: String, trim: true, maxlength: 150 },
    jobTitle: { type: String, trim: true, maxlength: 150 },
    emails: { type: [emailSchema], default: [] },
    phones: { type: [phoneSchema], default: [] },
    addresses: { type: [addressSchema], default: [] },
    socialLinks: { type: [socialSchema], default: [] },
    website: { type: String, trim: true, maxlength: 500 },
    birthday: Date,
    notes: { type: String, maxlength: 5000 },
    tags: { type: [String], default: [] },
    groups: [{ type: ObjectId, ref: 'Group' }],
    isFavorite: { type: Boolean, default: false },
    avatar: { type: new mongoose.Schema({ url: String, key: String }, { _id: false }), default: undefined },
    sharedWith: { type: [shareSchema], default: [] },
    // Soft delete: contacts sit in the trash until restored or purged.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contactSchema.index({ owner: 1, deletedAt: 1, name: 1 });
contactSchema.index({ owner: 1, 'emails.value': 1 });
contactSchema.index({ owner: 1, 'phones.normalized': 1 });
contactSchema.index({ owner: 1, tags: 1 });
contactSchema.index({ owner: 1, groups: 1 });
contactSchema.index({ 'sharedWith.user': 1 });

contactSchema.pre('validate', function normalizeFields() {
  for (const phone of this.phones) phone.normalized = normalizePhone(phone.value);
  this.tags = [...new Set(this.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
});

contactSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    ret.phones = ret.phones?.map(({ label, value }) => ({ label, value }));
    if (ret.avatar) delete ret.avatar.key;
    return ret;
  },
});

module.exports = mongoose.model('Contact', contactSchema);
