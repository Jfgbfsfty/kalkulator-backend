const mongoose = require('mongoose');

const cvApplicationSchema = new mongoose.Schema(
  {
    nick: { type: String, required: true, trim: true, maxlength: 50 },
    age: { type: Number, required: true, min: 1, max: 99 },
    whyJoin: { type: String, required: true, trim: true, maxlength: 1500 },
    experience: { type: String, trim: true, maxlength: 700, default: '' },
    availability: { type: String, trim: true, maxlength: 300, default: '' },
    contactDiscord: { type: String, trim: true, maxlength: 100, default: '' },
    additionalInfo: { type: String, trim: true, maxlength: 700, default: '' },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedByUsername: { type: String, default: null },
    status: {
      type: String,
      enum: ['NOWE', 'W_TRAKCIE', 'ZAAKCEPTOWANE', 'ODRZUCONE'],
      default: 'NOWE',
    },
    discordMessageId: { type: String, default: null },
    sentToDiscord: { type: Boolean, default: false },
    discordUserId: { type: String, trim: true, maxlength: 30, default: null },
    reviewedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CvApplication', cvApplicationSchema);
