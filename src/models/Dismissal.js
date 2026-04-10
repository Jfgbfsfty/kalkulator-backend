const mongoose = require('mongoose');

const dismissalSchema = new mongoose.Schema(
  {
    playerNick: { type: String, required: true, trim: true, maxlength: 50 },
    playerDiscordId: { type: String, default: null, trim: true },
    playerDiscordUsername: { type: String, default: null, trim: true, maxlength: 100 },
    rank: { type: String, required: true, trim: true, maxlength: 50 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    signedBy: { type: String, required: true, trim: true, maxlength: 100 },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    issuedByUsername: { type: String, default: null },
    dmSent: { type: Boolean, default: false },
    roleRemoved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dismissal', dismissalSchema);
