const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['SUPERADMIN', 'SZEF', 'ZASTEPCA', 'POLICJANT'];

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Nazwa użytkownika jest wymagana'],
      unique: true,
      trim: true,
      minlength: [3, 'Nazwa użytkownika musi mieć co najmniej 3 znaki'],
      maxlength: [30, 'Nazwa użytkownika może mieć maksymalnie 30 znaków'],
      // Tylko alfanumeryczne + podkreślenie (ochrona przed injection)
      match: [/^[a-zA-Z0-9_]+$/, 'Nazwa użytkownika może zawierać tylko litery, cyfry i podkreślenia'],
    },
    password: {
      type: String,
      required: [true, 'Hasło jest wymagane'],
      minlength: [8, 'Hasło musi mieć co najmniej 8 znaków'],
      select: false, // Nigdy nie zwracaj hasła w zapytaniach
    },
    role: {
      type: String,
      enum: ROLES,
      default: 'POLICJANT',
    },
    discordId: {
      type: String,
      trim: true,
      default: null,
    },
    discordUsername: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    lastLoginIp: {
      type: String,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.failedLoginAttempts;
        delete ret.lockedUntil;
        return ret;
      },
    },
  }
);

// Hash hasła przed zapisem
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Metoda porównania hasła
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Sprawdź, czy konto jest zablokowane (blokada wyłączona)
userSchema.methods.isLocked = function () {
  return false;
};

// Zwiększ licznik nieudanych logowań (bez blokady)
userSchema.methods.incFailedLogins = async function () {
  this.failedLoginAttempts += 1;
  return this.save();
};

// Zresetuj licznik po udanym logowaniu
userSchema.methods.resetFailedLogins = async function () {
  this.failedLoginAttempts = 0;
  this.lockedUntil = null;
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
