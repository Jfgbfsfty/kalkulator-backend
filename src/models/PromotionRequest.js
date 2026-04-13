const mongoose = require('mongoose');

const PLAYER_RANKS = ['Drógówka', 'Kadet', 'Sierżant', 'Z-szef', 'Szef'];

const promotionRequestSchema = new mongoose.Schema(
  {
    // Konto systemowe składające wniosek
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submittedByUsername: { type: String, required: true },

    // Dane gracza
    discordNick: { type: String, required: true, trim: true, maxlength: 100 },
    discordId: { type: String, required: true, trim: true, maxlength: 30 },
    currentRank: { type: String, required: true, trim: true, maxlength: 50 },
    desiredRank: { type: String, required: true, trim: true, maxlength: 50 },

    // Uzasadnienie
    hoursWorked: { type: Number, required: true, min: 0, max: 9999 },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    achievements: { type: String, trim: true, maxlength: 500, default: '' },
    availability: { type: Number, required: true, min: 1, max: 7 }, // dni w tygodniu
    additionalInfo: { type: String, trim: true, maxlength: 500, default: '' },

    // Status wniosku
    status: {
      type: String,
      enum: ['OCZEKUJE', 'ZATWIERDZONY', 'ODRZUCONY'],
      default: 'OCZEKUJE',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByUsername: { type: String, default: null },
    reviewNote: { type: String, trim: true, maxlength: 300, default: '' },
    reviewedAt: { type: Date, default: null },

    // Discord
    discordMessageId: { type: String, default: null },
  },
  { timestamps: true }
);

promotionRequestSchema.index({ submittedBy: 1, createdAt: -1 });

module.exports = mongoose.model('PromotionRequest', promotionRequestSchema);
module.exports.PLAYER_RANKS = PLAYER_RANKS;
