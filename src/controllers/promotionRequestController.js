const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const PromotionRequest = require('../models/PromotionRequest');
const Promotion = require('../models/Promotion');
const callBotApi = require('../utils/botApi');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const sendDiscordAudit = require('../utils/discordAudit');
const logger = require('../utils/logger');

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 godziny

const getEnv = (key, fallback = '') =>
  (process.env[key] || fallback).replace(/^["']|["']$/g, '');

const requestValidation = [
  body('discordNick').trim().notEmpty().isLength({ max: 100 }).withMessage('Nick Discord wymagany (max 100)'),
  body('targetUserId').optional({ checkFalsy: true }).isMongoId().withMessage('Nieprawidłowe ID użytkownika'),
  body('currentRank').trim().notEmpty().isLength({ max: 50 }).withMessage('Aktualny stopień wymagany'),
  body('desiredRank').trim().notEmpty().isLength({ max: 50 }).withMessage('Żądany stopień wymagany'),
  body('hoursWorked').isFloat({ min: 0, max: 9999 }).withMessage('Przepracowane godziny: 0–9999'),
  body('reason').trim().notEmpty().isLength({ min: 20, max: 1000 }).withMessage('Powód wymagany (min 20, max 1000 znaków)'),
  body('achievements').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Osiągnięcia max 500 znaków'),
  body('availability').isInt({ min: 1, max: 7 }).withMessage('Dostępność: 1–7 dni w tygodniu'),
  body('additionalInfo').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Dodatkowe info max 500 znaków'),
];

/**
 * GET /api/promotion-requests
 * Lista wniosków – SZEF / SUPERADMIN
 */
const getAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.nick) filter.discordNick = { $regex: req.query.nick, $options: 'i' };

    const [requests, total] = await Promise.all([
      PromotionRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PromotionRequest.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(`getPromotionRequests: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * GET /api/promotion-requests/my-cooldown
 * Sprawdza czy użytkownik może złożyć wniosek (cooldown 24h)
 */
const getCooldown = async (req, res) => {
  try {
    const last = await PromotionRequest.findOne(
      { submittedBy: req.user._id },
      { createdAt: 1 },
      { sort: { createdAt: -1 } }
    );

    if (!last) return res.json({ success: true, canSubmit: true, nextAllowedAt: null });

    const elapsed = Date.now() - new Date(last.createdAt).getTime();
    const remaining = COOLDOWN_MS - elapsed;

    if (remaining <= 0) {
      return res.json({ success: true, canSubmit: true, nextAllowedAt: null });
    }

    return res.json({
      success: true,
      canSubmit: false,
      nextAllowedAt: new Date(new Date(last.createdAt).getTime() + COOLDOWN_MS).toISOString(),
    });
  } catch (err) {
    logger.error(`getCooldown: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * POST /api/promotion-requests
 * Złóż wniosek – każdy zalogowany, limit 24h
 */
const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    // Sprawdź cooldown 24h
    const last = await PromotionRequest.findOne(
      { submittedBy: req.user._id },
      { createdAt: 1 },
      { sort: { createdAt: -1 } }
    );

    if (last) {
      const elapsed = Date.now() - new Date(last.createdAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const nextAllowedAt = new Date(new Date(last.createdAt).getTime() + COOLDOWN_MS).toISOString();
        return res.status(429).json({
          success: false,
          message: 'Możesz wysłać wniosek raz na 24 godziny.',
          nextAllowedAt,
        });
      }
    }

    const { discordNick, targetUserId, currentRank, desiredRank, hoursWorked, reason, achievements, availability, additionalInfo } = req.body;

    // Jeśli podano targetUserId, pobierz dane Discord z bazy
    let resolvedDiscordId = null;
    let resolvedDiscordNick = discordNick;
    if (targetUserId) {
      const User = require('../models/User');
      const targetUser = await User.findById(targetUserId).select('discordId discordUsername username').lean();
      if (targetUser) {
        resolvedDiscordId = targetUser.discordId || null;
        resolvedDiscordNick = targetUser.discordUsername || targetUser.username;
      }
    }

    const request = await PromotionRequest.create({
      submittedBy: req.user._id,
      submittedByUsername: req.user.username,
      discordNick: resolvedDiscordNick,
      discordId: resolvedDiscordId,
      currentRank,
      desiredRank,
      hoursWorked,
      reason,
      achievements: achievements || '',
      availability,
      additionalInfo: additionalInfo || '',
    });

    // Wyślij embed na Discord
    const embed = {
      color: 0xf59e0b,
      title: '📋 NOWY WNIOSEK O AWANS',
      fields: [
        { name: '🎮 Nick Discord', value: resolvedDiscordNick, inline: true },
        { name: '🆔 Discord ID', value: resolvedDiscordId || 'brak', inline: true },
        { name: '🎖️ Aktualny stopień', value: currentRank, inline: true },
        { name: '⭐ Wnioskowany stopień', value: desiredRank, inline: true },
        { name: '⏱️ Przepracowane godziny', value: `~${hoursWorked}h`, inline: true },
        { name: '📅 Dostępność', value: `${availability} dni/tydzień`, inline: true },
        { name: '✍️ Powód', value: reason },
        ...(achievements ? [{ name: '🏆 Osiągnięcia', value: achievements }] : []),
        ...(additionalInfo ? [{ name: '💬 Dodatkowe informacje', value: additionalInfo }] : []),
        { name: '👤 Konto systemowe', value: req.user.username, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Kalkulator Mandatów | Polskie RP' },
    };

    let discordMessageId = null;
    try {
      const botRes = await callBotApi('/api/send-promotion-request', { embed });
      discordMessageId = botRes.messageId || null;
    } catch (botErr) {
      logger.warn(`PromotionRequest Discord send failed: ${botErr.message}`);
    }

    request.discordMessageId = discordMessageId;
    await request.save();

    await logAction('CREATE_PROMOTION_REQUEST', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: { discordNick: resolvedDiscordNick, currentRank, desiredRank, hoursWorked },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    logger.error(`createPromotionRequest: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * PUT /api/promotion-requests/:id/review
 * Zatwierdź lub odrzuć wniosek – SZEF / SUPERADMIN
 */
const review = async (req, res) => {
  try {
    const { status, reviewNote } = req.body;
    if (!['ZATWIERDZONY', 'ODRZUCONY'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status musi być ZATWIERDZONY lub ODRZUCONY' });
    }

    const request = await PromotionRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Nie znaleziono wniosku' });
    if (request.status !== 'OCZEKUJE') {
      return res.status(400).json({ success: false, message: 'Wniosek już rozpatrzony' });
    }

    request.status = status;
    request.reviewedBy = req.user._id;
    request.reviewedByUsername = req.user.username;
    request.reviewNote = reviewNote || '';
    request.reviewedAt = new Date();
    await request.save();

    // Automatycznie wystaw awans przy zatwierdzeniu
    if (status === 'ZATWIERDZONY') {
      try {
        const signedBy = req.user.username;
        const autoReason = `Zatwierdzona prośba o awans (wniosek #${request._id.toString().slice(-6).toUpperCase()})`;

        const promotion = await Promotion.create({
          playerNick: request.discordNick,
          type: 'AWANS',
          fromRank: request.currentRank,
          toRank: request.desiredRank,
          reason: autoReason,
          signedBy,
          playerDiscordId: request.discordId || null,
          issuedBy: req.user._id,
          issuedByUsername: req.user.username,
        });

        const embed = {
          color: 0x00ff88,
          title: '⬆️ AWANS',
          fields: [
            { name: '👮 Gracz', value: request.discordNick, inline: true },
            { name: '📊 Zmiana stopnia', value: `${request.currentRank} → ${request.desiredRank}`, inline: true },
            { name: '📋 Powód', value: autoReason },
            { name: '✍️ Podpisał', value: signedBy, inline: true },
            { name: '👨‍💼 Wystawił', value: req.user.username, inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Kalkulator Mandatów | Polskie RP' },
        };

        let discordMessageId = null;
        try {
          const botRes = await callBotApi('/api/send-promotion', { embed, discordUserId: request.discordId || null });
          discordMessageId = botRes.messageId || null;
        } catch (botErr) {
          logger.warn(`Auto-promotion Discord send failed: ${botErr.message}`);
        }

        if (request.discordId) {
          try {
            const swapRes = await callBotApi('/api/swap-roles', {
              discordUserId: request.discordId,
              fromRank: request.currentRank,
              toRank: request.desiredRank,
            });
            if (swapRes.errors?.length) logger.warn(`auto swap-roles: ${swapRes.errors.join(', ')}`);
          } catch (swapErr) {
            logger.warn(`auto swap-roles failed: ${swapErr.message}`);
          }
        }

        promotion.discordMessageId = discordMessageId;
        promotion.sentToDiscord = !!discordMessageId;
        await promotion.save();

        await logAction('CREATE_PROMOTION', {
          performedBy: req.user._id,
          performedByUsername: req.user.username,
          performedByDiscordId: req.user.discordId || null,
          performedByDiscordUsername: req.user.discordUsername || null,
          details: { playerNick: request.discordNick, type: 'AWANS', fromRank: request.currentRank, toRank: request.desiredRank, signedBy, source: 'promotion-request' },
          ipAddress: getClientIp(req),
        });
        sendDiscordAudit('CREATE_PROMOTION', req.user.username, { 'Gracz': request.discordNick, 'Typ': 'AWANS (auto)', 'Zmiana stopnia': `${request.currentRank} → ${request.desiredRank}`, 'Podpisał': signedBy }, getClientIp(req));
      } catch (autoErr) {
        logger.error(`Auto-create promotion failed: ${autoErr.message}`);
        // Nie przerywamy — wniosek już zatwierdzony
      }
    }

    await logAction('REVIEW_PROMOTION_REQUEST', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: { discordNick: request.discordNick, status, reviewNote },
      ipAddress: getClientIp(req),
    });

    res.json({ success: true, data: request });
  } catch (err) {
    logger.error(`reviewPromotionRequest: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * DELETE /api/promotion-requests/:id
 * Usuń wniosek – SZEF / SUPERADMIN
 */
const remove = async (req, res) => {
  try {
    const request = await PromotionRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Nie znaleziono' });

    await PromotionRequest.findByIdAndDelete(req.params.id);

    await logAction('DELETE_PROMOTION_REQUEST', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: { discordNick: request.discordNick, status: request.status },
      ipAddress: getClientIp(req),
    });

    res.json({ success: true, message: 'Usunięto' });
  } catch (err) {
    logger.error(`deletePromotionRequest: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { getAll, getCooldown, create, review, remove, requestValidation };
