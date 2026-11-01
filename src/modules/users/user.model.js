const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

const fileSchema = new mongoose.Schema({ url: String, key: String }, { _id: false });

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // Optional because Google-only accounts have no password.
    password: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    avatar: { type: fileSchema, default: undefined },

    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordChangedAt: Date,

    preferences: {
      birthdayReminders: { type: Boolean, default: true },
      timezone: { type: String, default: 'UTC' },
    },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.password = await bcrypt.hash(plain, BCRYPT_ROUNDS);
};

userSchema.methods.comparePassword = async function comparePassword(plain) {
  if (!this.password) return false;
  return bcrypt.compare(plain, this.password);
};

userSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.password;
    delete ret.googleId;
    delete ret.emailVerificationToken;
    delete ret.emailVerificationExpires;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    if (ret.avatar) delete ret.avatar.key;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
