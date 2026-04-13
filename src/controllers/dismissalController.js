const { body, validationResult } = require('express-validator');
const Dismissal = require('../models/Dismissal');
const callBotApi = require('../utils/botApi');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const sendDiscordAudit = require('../utils/discordAudit');
const logger = require('../utils/logger');

const dismissalValidation = [
  body('playerNick').trim().notEmpty().isLength({ max: 50 }).withMessage('Nick wymagany (max 50)'),
  body('rank').trim().notEmpty().isLength({ max: 50 }).withMessage('Stopień wymagany (max 50)'),
  body('reason').trim().notEmpty().isLength({ max: 500 }).withMessage('Powód wymagany (max 500)'),
  body('signedBy').trim().notEmpty().isLength({ max: 100 }).withMessage('Podpisał wymagane (max 100)'),
  body('playerDiscordId').optional({ checkFalsy: true }).trim().isString().isLength({ max: 30 }),
  body('playerDiscordUsername').optional({ checkFalsy: true }).trim().isString().isLength({ max: 100 }),
  body('sendToChannel').optional().isBoolean(),
];

/**
 * GET /api/dismissals
 */
const getDismissals = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.nick) filter.playerNick = { $regex: req.query.nick, $options: 'i' };

    const [dismissals, total] = await Promise.all([
      Dismissal.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Dismissal.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: dismissals,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(`getDismissals: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * POST /api/dismissals
 */
const createDismissal = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { playerNick, playerDiscordId, playerDiscordUsername, rank, reason, signedBy, sendToChannel } = req.body;

    const dismissal = await Dismissal.create({
      playerNick,
      playerDiscordId: playerDiscordId || null,
      playerDiscordUsername: playerDiscordUsername || null,
      rank,
      reason,
      signedBy,
      issuedBy: req.user._id,
      issuedByUsername: req.user.username,
    });

    const embed = {
      color: 0xff0000,
      title: '🚫 ZWOLNIENIE',
      fields: [
        { name: '👮 Gracz', value: playerNick, inline: true },
        { name: '🎖️ Stopień', value: rank, inline: true },
        { name: '📋 Powód', value: reason },
        { name: '✍️ Podpisał', value: signedBy, inline: true },
        { name: '👨‍💼 Wystawił', value: req.user.username, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Kalkulator Mandatów | Polskie RP' },
    };

    let dmSent = false;
    let roleRemoved = false;
    try {
      const botRes = await callBotApi('/api/send-dismissal', {
        embed,
        discordUserId: playerDiscordId || null,
        sendToChannel: sendToChannel !== false,
      });
      dmSent = botRes.dmSent || false;
      roleRemoved = botRes.roleRemoved || false;
    } catch (botErr) {
      logger.warn(`send-dismissal bot call failed: ${botErr.message}`);
    }

    dismissal.dmSent = dmSent;
    dismissal.roleRemoved = roleRemoved;
    await dismissal.save();

    await logAction('CREATE_DISMISSAL', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: { playerNick, rank, reason, signedBy },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('CREATE_DISMISSAL', req.user.username, {
      'Gracz': playerNick,
      'Stopień': rank,
      'Powód': reason,
      'Podpisał': signedBy,
    }, getClientIp(req));

    res.status(201).json({ success: true, data: dismissal });
  } catch (err) {
    logger.error(`createDismissal: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * DELETE /api/dismissals/:id
 */
const deleteDismissal = async (req, res) => {
  try {
    const dismissal = await Dismissal.findById(req.params.id);
    if (!dismissal) return res.status(404).json({ success: false, message: 'Nie znaleziono' });

    await Dismissal.findByIdAndDelete(req.params.id);

    await logAction('DELETE_DISMISSAL', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: { playerNick: dismissal.playerNick, rank: dismissal.rank },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('DELETE_DISMISSAL', req.user.username, {
      'Nick': dismissal.playerNick,
      'Stopień': dismissal.rank,
    }, getClientIp(req));

    res.json({ success: true, message: 'Usunięto' });
  } catch (err) {
    logger.error(`deleteDismissal: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { getDismissals, createDismissal, deleteDismissal, dismissalValidation };
