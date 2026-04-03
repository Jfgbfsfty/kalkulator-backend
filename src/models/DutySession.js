const mongoose = require('mongoose');

const dutySessionSchema = new mongoose.Schema(
  {
    discordId: { type: String, required: true, index: true },
    discordUsername: { type: String, trim: true, default: null },
    guildId: { type: String, default: null },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    durationMinutes: { type: Number, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

dutySessionSchema.index({ discordId: 1, isActive: 1 });

module.exports = mongoose.model('DutySession', dutySessionSchema);
