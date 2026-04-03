const mongoose = require('mongoose');

const PLAYER_RANKS = ['Kadet', 'Drogówka', 'Sierżant', 'Z-szef', 'Szef'];

const promotionSchema = new mongoose.Schema(
  {
    playerNick: { type: String, required: true, trim: true, maxlength: 50 },
    type: { type: String, enum: ['AWANS', 'DEGRADACJA'], required: true },
    fromRank: { type: String, required: true, trim: true, maxlength: 50 },
    toRank: { type: String, required: true, trim: true, maxlength: 50 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    signedBy: { type: String, required: true, trim: true, maxlength: 100 },
    playerDiscordId: { type: String, default: null, trim: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    issuedByUsername: { type: String, default: null },
    discordMessageId: { type: String, default: null },
    sentToDiscord: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Promotion', promotionSchema);
module.exports.PLAYER_RANKS = PLAYER_RANKS;
