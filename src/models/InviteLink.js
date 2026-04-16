const mongoose = require('mongoose');

const inviteLinkSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    // Discord dane pobrane podczas rejestracji
    discordId: {
      type: String,
      default: null,
    },
    discordUsername: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Auto-usuń wygasłe linki po 7 dniach od expiresAt
inviteLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('InviteLink', inviteLinkSchema);
