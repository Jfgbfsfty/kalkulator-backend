const mongoose = require('mongoose');

const collectedLicenseSchema = new mongoose.Schema(
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
    collectedAt: {
      type: Date,
      required: [true, 'Data zabrania jest wymagana'],
      default: Date.now,
    },
    takenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    returnDate: {
      type: Date,
      default: null,
    },
    isReturned: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [300, 'Notatki mogą mieć maksymalnie 300 znaków'],
      default: '',
    },
  },
  { timestamps: true }
);

collectedLicenseSchema.index({ isReturned: 1 });

module.exports = mongoose.model('CollectedLicense', collectedLicenseSchema);
