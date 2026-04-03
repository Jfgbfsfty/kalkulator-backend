const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Zapisuje akcję do dziennika audytu.
 * Może być używane jako middleware lub bezpośrednio w kontrolerze.
 *
 * @param {string} action - Nazwa akcji (np. 'LOGIN', 'CREATE_MANDATE')
 * @param {object} options - Dodatkowe opcje
 */
const logAction = async (action, options = {}) => {
  try {
    await AuditLog.create({
      action,
      performedBy: options.performedBy,
      performedByUsername: options.performedByUsername || 'unknown',
      targetUser: options.targetUser || null,
      targetResource: options.targetResource || null,
      details: options.details || null,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
      success: options.success !== undefined ? options.success : true,
    });
  } catch (err) {
    // Nie przerywaj głównej operacji jeśli zapis logu się nie uda
    logger.error(`Błąd zapisu do dziennika audytu: ${err.message}`);
  }
};

/**
 * Pomocnicza funkcja do pobrania IP z requestu
 */
const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.ip ||
    'unknown'
  );
};

module.exports = { logAction, getClientIp };
