const mongoose = require('mongoose');

/**
 * One document per issued refresh token. Tokens rotate on every refresh;
 * all tokens from the same login share a `family`, so reuse of an already
 * rotated token revokes the whole family (likely theft).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    userAgent: String,
    ip: String,
  },
  { timestamps: true }
);

// MongoDB removes expired tokens on its own.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
