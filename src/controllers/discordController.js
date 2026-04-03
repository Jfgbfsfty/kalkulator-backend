const axios = require('axios');
const { body, validationResult } = require('express-validator');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const logger = require('../utils/logger');

const roleValidation = [
  body('discordUserId').notEmpty().withMessage('Discord User ID wymagany'),
  body('roleId').notEmpty().withMessage('Discord Role ID wymagany'),
];

/**
 * Wysyła żądanie do bota Discord przez jego lokalny HTTP API
 */
const callBotApi = async (endpoint, data) => {
  const botUrl = process.env.BOT_API_URL || 'http://localhost:3001';
  const secret = process.env.BOT_API_SECRET;

  const response = await axios.post(`${botUrl}${endpoint}`, data, {
    headers: {
      'Content-Type': 'application/json',
      'x-bot-secret': secret,
    },
    timeout: 5000,
  });
  return response.data;
};

/**
 * POST /api/discord/assign-role
 * Nadaje rolę Discord użytkownikowi
 */
const assignRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { discordUserId, roleId, username } = req.body;

  try {
    const result = await callBotApi('/api/assign-role', { discordUserId, roleId });

    await logAction('DISCORD_ASSIGN_ROLE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: { discordUserId, roleId, username },
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, message: 'Rola nadana pomyślnie', data: result });
  } catch (err) {
    logger.error(`assignRole Discord: ${err.message}`);
    const message = err.response?.data?.message || 'Błąd komunikacji z botem Discord';
    res.status(502).json({ success: false, message });
  }
};

/**
 * POST /api/discord/remove-role
 * Usuwa rolę Discord użytkownikowi
 */
const removeRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { discordUserId, roleId, username } = req.body;

  try {
    const result = await callBotApi('/api/remove-role', { discordUserId, roleId });

    await logAction('DISCORD_REMOVE_ROLE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: { discordUserId, roleId, username },
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, message: 'Rola usunięta pomyślnie', data: result });
  } catch (err) {
    logger.error(`removeRole Discord: ${err.message}`);
    const message = err.response?.data?.message || 'Błąd komunikacji z botem Discord';
    res.status(502).json({ success: false, message });
  }
};

/**
 * POST /api/discord/send-log
 * Wysyła wiadomość logów na kanał Discord
 */
const sendLog = async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'Treść wiadomości jest wymagana' });

  try {
    await callBotApi('/api/send-log', { message });

    await logAction('DISCORD_SEND_LOG', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: { message },
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, message: 'Log wysłany na Discord' });
  } catch (err) {
    logger.error(`sendLog Discord: ${err.message}`);
    res.status(502).json({ success: false, message: 'Błąd komunikacji z botem Discord' });
  }
};

/**
 * GET /api/discord/guild-roles
 * Pobiera listę ról z serwera Discord
 */
const getGuildRoles = async (req, res) => {
  try {
    const result = await callBotApi('/api/guild-roles', {});
    res.status(200).json({ success: true, data: result.roles });
  } catch (err) {
    logger.error(`getGuildRoles Discord: ${err.message}`);
    res.status(502).json({ success: false, message: 'Błąd komunikacji z botem Discord' });
  }
};

module.exports = { assignRole, removeRole, sendLog, getGuildRoles, roleValidation };
