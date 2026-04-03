const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    // Przechowujemy HASH tokena, nie sam token (bezpieczeństwo)
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Automatyczne usuwanie wygasłych tokenów (MongoDB TTL index)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ user: 1 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
