const mongoose = require('mongoose');

const RANKS = ['Drogówka', 'Kadet', 'Sierżant', 'Z-szef', 'Szef'];

const salaryConfigSchema = new mongoose.Schema(
  {
    rankName: {
      type: String,
      required: true,
      unique: true,
      enum: RANKS,
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

const SalaryConfig = mongoose.model('SalaryConfig', salaryConfigSchema);

module.exports = SalaryConfig;
module.exports.RANKS = RANKS;
