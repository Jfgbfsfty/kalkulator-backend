const mongoose = require('mongoose');

const CATEGORIES = ['PREDKOSC', 'POJAZD', 'DOKUMENTY', 'ZACHOWANIE', 'ALKOHOL', 'INNE'];

const mandateSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Tytuł mandatu jest wymagany'],
      trim: true,
      maxlength: [100, 'Tytuł może mieć maksymalnie 100 znaków'],
    },
    description: {
      type: String,
      required: [true, 'Opis mandatu jest wymagany'],
      trim: true,
      maxlength: [500, 'Opis może mieć maksymalnie 500 znaków'],
    },
    price: {
      type: Number,
      required: [true, 'Cena mandatu jest wymagana'],
      min: [0, 'Cena nie może być ujemna'],
      max: [1000000, 'Cena nie może przekraczać 1 000 000'],
    },
    penaltyPoints: {
      type: Number,
      default: 0,
      min: [0, 'Punkty karne nie mogą być ujemne'],
      max: [10, 'Punkty karne nie mogą przekraczać 10'],
    },
    category: {
      type: String,
      enum: CATEGORIES,
      required: [true, 'Kategoria jest wymagana'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
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

// Indeks na kategorię dla szybkiego filtrowania
mandateSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('Mandate', mandateSchema);
module.exports.CATEGORIES = CATEGORIES;
