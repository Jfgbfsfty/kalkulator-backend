const { body, validationResult } = require('express-validator');
const Promotion = require('../models/Promotion');
const { PLAYER_RANKS } = require('../models/Promotion');
const callBotApi = require('../utils/botApi');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const sendDiscordAudit = require('../utils/discordAudit');
const logger = require('../utils/logger');

const promotionValidation = [
  body('playerNick').trim().notEmpty().isLength({ max: 50 }).withMessage('Nick wymagany (max 50)'),
  body('type').isIn(['AWANS', 'DEGRADACJA']).withMessage('Typ musi być AWANS lub DEGRADACJA'),
  body('fromRank').trim().notEmpty().isLength({ max: 50 }).withMessage('Stopień przed wymagany'),
  body('toRank').trim().notEmpty().isLength({ max: 50 }).withMessage('Stopień po wymagany'),
  body('reason').trim().notEmpty().isLength({ max: 500 }).withMessage('Powód wymagany (max 500)'),
  body('signedBy').trim().notEmpty().isLength({ max: 100 }).withMessage('Podpisał wymagane (max 100)'),
  body('playerDiscordId').optional({ checkFalsy: true }).trim().isString().isLength({ max: 30 }).withMessage('Discord ID gracza – opcjonalne'),
];

/**
 * GET /api/promotions
 */
const getPromotions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.nick) filter.playerNick = { $regex: req.query.nick, $options: 'i' };

    const [promotions, total] = await Promise.all([
      Promotion.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Promotion.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: promotions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(`getPromotions: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * POST /api/promotions
 * Tworzy awans/degradację i wysyła embed na Discord
 */
const createPromotion = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { playerNick, type, fromRank, toRank, reason, signedBy, playerDiscordId } = req.body;

    const promotion = await Promotion.create({
      playerNick,
      type,
      fromRank,
      toRank,
      reason,
      signedBy,
      playerDiscordId: playerDiscordId || null,
      issuedBy: req.user._id,
      issuedByUsername: req.user.username,
    });

    // Wyślij embed na Discord
    const isPromotion = type === 'AWANS';
    const embed = {
      color: isPromotion ? 0x00ff88 : 0xff4444,
      title: isPromotion ? '⬆️ AWANS' : '⬇️ DEGRADACJA',
      fields: [
        { name: '👮 Gracz', value: playerNick, inline: true },
        { name: '📊 Zmiana stopnia', value: `${fromRank} → ${toRank}`, inline: true },
        { name: '📋 Powód', value: reason },
        { name: '✍️ Podpisał', value: signedBy, inline: true },
        { name: '👨‍💼 Wystawił', value: req.user.username, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Kalkulator Mandatów | Polskie RP' },
    };

    let discordMessageId = null;
    try {
      const botRes = await callBotApi('/api/send-promotion', { embed });
      discordMessageId = botRes.messageId || null;
    } catch (botErr) {
      logger.warn(`Promotion Discord send failed: ${botErr.message}`);
    }

    // Zamień role Discord jeśli podano Discord ID gracza
    if (playerDiscordId) {
      try {
        const swapRes = await callBotApi('/api/swap-roles', {
          discordUserId: playerDiscordId,
          fromRank,
          toRank,
        });
        if (swapRes.errors?.length) {
          logger.warn(`swap-roles warnings: ${swapRes.errors.join(', ')}`);
        }
      } catch (swapErr) {
        logger.warn(`swap-roles failed: ${swapErr.message}`);
      }
    }

    promotion.discordMessageId = discordMessageId;
    promotion.sentToDiscord = !!discordMessageId;
    await promotion.save();

    await logAction('CREATE_PROMOTION', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: { playerNick, type, fromRank, toRank, signedBy },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('CREATE_PROMOTION', req.user.username, { 'Gracz': playerNick, 'Typ': type, 'Zmiana stopnia': `${fromRank} → ${toRank}`, 'Powód': reason, 'Podpisał': signedBy }, getClientIp(req));

    res.status(201).json({ success: true, data: promotion });
  } catch (err) {
    logger.error(`createPromotion: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * DELETE /api/promotions/:id
 */
const deletePromotion = async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) return res.status(404).json({ success: false, message: 'Nie znaleziono' });

    await Promotion.findByIdAndDelete(req.params.id);

    await logAction('DELETE_PROMOTION', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: { playerNick: promotion.playerNick, type: promotion.type },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('DELETE_PROMOTION', req.user.username, { 'Nick': promotion.playerNick, 'Typ': promotion.type }, getClientIp(req));

    res.json({ success: true, message: 'Usunięto' });
  } catch (err) {
    logger.error(`deletePromotion: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { getPromotions, createPromotion, deletePromotion, promotionValidation, PLAYER_RANKS };
