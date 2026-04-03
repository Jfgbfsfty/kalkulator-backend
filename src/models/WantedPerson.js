const mongoose = require('mongoose');

const STATUSES = ['POSZUKIWANY', 'ZATRZYMANY', 'ZWOLNIONY'];

const wantedPersonSchema = new mongoose.Schema(
  {
    nick: {
      type: String,
      required: [true, 'Nick jest wymagany'],
      trim: true,
      maxlength: [50, 'Nick może mieć maksymalnie 50 znaków'],
    },
    reason: {
      type: String,
      required: [true, 'Powód jest wymagany'],
      trim: true,
      maxlength: [300, 'Powód może mieć maksymalnie 300 znaków'],
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'POSZUKIWANY',
    },
    additionalInfo: {
      type: String,
      trim: true,
      maxlength: [500, 'Dodatkowe informacje mogą mieć maksymalnie 500 znaków'],
      default: '',
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

wantedPersonSchema.index({ status: 1 });
wantedPersonSchema.index({ nick: 'text' }); // Wyszukiwanie pełnotekstowe

module.exports = mongoose.model('WantedPerson', wantedPersonSchema);
module.exports.STATUSES = STATUSES;
