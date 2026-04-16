const { body, validationResult } = require('express-validator');
const CvApplication = require('../models/CvApplication');
const callBotApi = require('../utils/botApi');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const sendDiscordAudit = require('../utils/discordAudit');
const logger = require('../utils/logger');

const cvValidation = [
  body('nick').trim().notEmpty().isLength({ max: 50 }).withMessage('Nick wymagany (max 50)'),
  body('age').isInt({ min: 1, max: 99 }).withMessage('Wiek 1-99'),
  body('whyJoin').trim().notEmpty().isLength({ max: 1500 }).withMessage('Motywacja wymagana (max 1500 znaków)'),
  body('experience').optional().trim().isLength({ max: 700 }),
  body('availability').optional().trim().isLength({ max: 300 }),
  body('contactDiscord').optional().trim().isLength({ max: 100 }),
  body('additionalInfo').optional().trim().isLength({ max: 700 }),
  body('discordUserId').optional().trim().matches(/^\d{17,20}$/).withMessage('Discord ID musi być liczbą 17-20 cyfr'),
];

/**
 * POST /api/cv
 * Zgłoszenie CV – dostępne dla wszystkich zalogowanych
 */
const submitCv = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { nick, age, whyJoin, experience, availability, contactDiscord, additionalInfo, discordUserId } = req.body;

    const cv = await CvApplication.create({
      nick,
      age,
      whyJoin,
      experience: experience || '',
      availability: availability || '',
      contactDiscord: contactDiscord || '',
      additionalInfo: additionalInfo || '',
      discordUserId: discordUserId || null,
      submittedBy: req.user?._id || null,
      submittedByUsername: req.user?.username || 'Anonim',
    });

    // Wyślij na Discord
    const embed = {
      color: 0x3b82f6,
      title: '📄 NOWE CV NA POLICJĘ',
      fields: [
        { name: '👤 Nick', value: nick, inline: true },
        { name: '🎂 Wiek', value: String(age), inline: true },
        { name: '💬 Dlaczego chcę służyć?', value: whyJoin.slice(0, 1024) },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `Przesłał: ${req.user?.username || contactDiscord || nick} | Kalkulator Mandatów – Polskie RP` },
    };

    if (discordUserId) embed.fields.push({ name: '🔑 Discord ID', value: discordUserId, inline: true });
    if (experience) embed.fields.push({ name: '🎖️ Doświadczenie', value: experience.slice(0, 1024) });
    if (availability) embed.fields.push({ name: '🕐 Dostępność', value: availability, inline: true });
    if (contactDiscord) embed.fields.push({ name: '💬 Kontakt Discord', value: contactDiscord, inline: true });
    if (additionalInfo) embed.fields.push({ name: '📝 Dodatkowe informacje', value: additionalInfo.slice(0, 1024) });

    let discordMessageId = null;
    try {
      const botRes = await callBotApi('/api/send-cv', {
        embed,
        cvId: cv._id.toString(),
        discordUserId: cv.discordUserId || null,
      });
      discordMessageId = botRes.messageId || null;
    } catch (botErr) {
      logger.warn(`CV Discord send failed: ${botErr.message}`);
    }

    cv.discordMessageId = discordMessageId;
    cv.sentToDiscord = !!discordMessageId;
    await cv.save();

    await logAction('SUBMIT_CV', {
      performedBy: req.user?._id || null,
      performedByUsername: req.user?.username || contactDiscord || nick,
      details: { nick, age },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('SUBMIT_CV', req.user?.username || nick, { 'Nick': nick, 'Wiek': age, 'Kontakt Discord': contactDiscord || '—' }, getClientIp(req));

    res.status(201).json({ success: true, data: cv });
  } catch (err) {
    logger.error(`submitCv: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * GET /api/cv
 * Lista CV – tylko SZEF i wyżej
 */
const getCvApplications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.nick) filter.nick = { $regex: req.query.nick, $options: 'i' };

    const [cvs, total] = await Promise.all([
      CvApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      CvApplication.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: cvs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(`getCvApplications: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * PUT /api/cv/:id/status
 * Aktualizacja statusu CV – tylko SZEF i wyżej
 */
const updateCvStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['NOWE', 'W_TRAKCIE', 'ZAAKCEPTOWANE', 'ODRZUCONE'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: 'Nieprawidłowy status' });
  }

  try {
    const cv = await CvApplication.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!cv) return res.status(404).json({ success: false, message: 'Nie znaleziono' });

    res.json({ success: true, data: cv });
  } catch (err) {
    logger.error(`updateCvStatus: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * PUT /api/cv/:id/bot-review
 * Aktualizacja statusu CV przez bota Discord (x-bot-secret)
 */
const botUpdateCvStatus = async (req, res) => {
  const secret = req.headers['x-bot-secret'];
  const expected = (process.env.BOT_API_SECRET || '').replace(/^["']|["']$/g, '');
  if (!secret || secret !== expected) {
    return res.status(401).json({ success: false, message: 'Nieautoryzowany' });
  }

  const { status, reviewedBy } = req.body;
  const allowed = ['ZAAKCEPTOWANE', 'ODRZUCONE'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: 'Nieprawidłowy status' });
  }

  try {
    const cv = await CvApplication.findByIdAndUpdate(
      req.params.id,
      { status, reviewedBy: reviewedBy || null },
      { new: true }
    );
    if (!cv) return res.status(404).json({ success: false, message: 'Nie znaleziono CV' });

    await logAction(`CV_${status}`, {
      performedByUsername: `[BOT] ${reviewedBy || 'Discord'}`,
      details: { nick: cv.nick, cvId: cv._id.toString(), status },
      ipAddress: 'bot-internal',
    });

    res.json({ success: true, data: cv });
  } catch (err) {
    logger.error(`botUpdateCvStatus: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { submitCv, getCvApplications, updateCvStatus, botUpdateCvStatus, cvValidation };
