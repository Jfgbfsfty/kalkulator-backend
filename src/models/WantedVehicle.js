const mongoose = require('mongoose');

const STATUSES = ['POSZUKIWANY', 'ZATRZYMANY', 'ZWOLNIONY'];

const wantedVehicleSchema = new mongoose.Schema(
  {
    model: {
      type: String,
      required: [true, 'Model pojazdu jest wymagany'],
      trim: true,
      maxlength: [80, 'Model może mieć maksymalnie 80 znaków'],
    },
    licensePlate: {
      type: String,
      trim: true,
      maxlength: [20, 'Numer rejestracyjny może mieć maksymalnie 20 znaków'],
      default: '',
    },
    owner: {
      type: String,
      required: [true, 'Właściciel jest wymagany'],
      trim: true,
      maxlength: [50, 'Właściciel może mieć maksymalnie 50 znaków'],
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
    imageUrl: {
      type: String,
      default: null,
    },
    imageData: {
      type: String,
      default: null,
    },
    imageMimeType: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

wantedVehicleSchema.index({ status: 1 });

module.exports = mongoose.model('WantedVehicle', wantedVehicleSchema);
module.exports.STATUSES = STATUSES;
