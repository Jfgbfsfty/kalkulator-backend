const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    performedByUsername: {
      type: String,
      required: true,
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    targetResource: {
      type: String, // np. 'mandate:abc123'
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed, // Dowolne dane JSON
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    success: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    capped: { size: 50 * 1024 * 1024, max: 10000 }, // Max 50MB / 10k rekordów
  }
);

auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
