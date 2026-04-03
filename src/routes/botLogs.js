const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

// Weryfikacja sekretu bota – zamiast JWT
const verifyBotSecret = (req, res, next) => {
  const secret = req.headers['x-bot-secret'];
  if (!secret || secret !== process.env.BOT_API_SECRET) {
    return res.status(401).json({ success: false, message: 'Nieautoryzowany dostęp do Bot Logs API' });
  }
  next();
};

/**
 * POST /api/bot-logs
 * Bot Discord zapisuje zdarzenia do dziennika audytu
 */
router.post('/', verifyBotSecret, async (req, res) => {
  const { action, performedByUsername, targetResource, details, success: isSuccess } = req.body;

  if (!action || !performedByUsername) {
    return res.status(400).json({ success: false, message: 'Wymagane pola: action, performedByUsername' });
  }

  try {
    await AuditLog.create({
      action,
      performedByUsername: `[BOT] ${performedByUsername}`,
      targetResource: targetResource || null,
      details: details || {},
      ipAddress: 'bot-internal',
      success: isSuccess !== false,
    });
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error(`botLog: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

module.exports = router;
