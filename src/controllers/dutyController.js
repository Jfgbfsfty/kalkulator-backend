const DutySession = require('../models/DutySession');
const { logAction } = require('../middleware/auditLogger');
const logger = require('../utils/logger');

// ─── Bot endpoints (x-bot-secret auth) ────────────────────────────────────────

/**
 * POST /api/bot-duty/on
 * Bot wywołuje, gdy gracz używa /on
 */
const botDutyOn = async (req, res) => {
  const { discordId, discordUsername, guildId } = req.body;
  if (!discordId) return res.status(400).json({ success: false, message: 'discordId wymagane' });

  try {
    const active = await DutySession.findOne({ discordId, isActive: true });
    if (active) {
      return res.json({ success: false, alreadyOnDuty: true, message: 'Już na służbie' });
    }

    const session = await DutySession.create({
      discordId,
      discordUsername: discordUsername || null,
      guildId: guildId || null,
      startTime: new Date(),
      isActive: true,
    });

    res.status(201).json({ success: true, session });
  } catch (err) {
    logger.error(`botDutyOn: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * POST /api/bot-duty/off
 * Bot wywołuje, gdy gracz używa /off
 */
const botDutyOff = async (req, res) => {
  const { discordId } = req.body;
  if (!discordId) return res.status(400).json({ success: false, message: 'discordId wymagane' });

  try {
    const active = await DutySession.findOne({ discordId, isActive: true });
    if (!active) {
      return res.json({ success: false, notOnDuty: true, message: 'Nie na służbie' });
    }

    const endTime = new Date();
    const durationMinutes = Math.max(0, Math.round((endTime - active.startTime) / 60000));

    active.endTime = endTime;
    active.durationMinutes = durationMinutes;
    active.isActive = false;
    await active.save();

    // Suma wszystkich minut dla tego gracza
    const agg = await DutySession.aggregate([
      { $match: { discordId, isActive: false } },
      { $group: { _id: '$discordId', totalMinutes: { $sum: '$durationMinutes' } } },
    ]);
    const totalMinutes = agg[0]?.totalMinutes ?? durationMinutes;

    res.json({ success: true, durationMinutes, totalMinutes, session: active });
  } catch (err) {
    logger.error(`botDutyOff: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * GET /api/bot-duty/stats
 * Bot pobiera statystyki do /top
 */
const botDutyStats = async (req, res) => {
  try {
    const matchFilter = { isActive: false };
    if (req.query.guildId) matchFilter.guildId = req.query.guildId;

    const stats = await DutySession.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$discordId',
          discordUsername: { $last: '$discordUsername' },
          totalMinutes: { $sum: '$durationMinutes' },
          sessions: { $sum: 1 },
          lastSession: { $max: '$endTime' },
        },
      },
      { $sort: { totalMinutes: -1 } },
      { $limit: 50 },
    ]);

    const data = stats.map((e) => ({
      discordId: e._id,
      discordUsername: e.discordUsername || e._id,
      totalMinutes: e.totalMinutes,
      sessions: e.sessions,
      lastSession: e.lastSession,
    }));

    res.json({ success: true, data });
  } catch (err) {
    logger.error(`botDutyStats: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

// ─── Web admin endpoints (JWT auth) ───────────────────────────────────────────

/**
 * GET /api/duty/stats – widok dla admina na stronie
 */
const getDutyStats = async (req, res) => {
  try {
    const stats = await DutySession.aggregate([
      { $match: { isActive: false } },
      {
        $group: {
          _id: '$discordId',
          discordUsername: { $last: '$discordUsername' },
          totalMinutes: { $sum: '$durationMinutes' },
          sessions: { $sum: 1 },
          lastSession: { $max: '$endTime' },
        },
      },
      { $sort: { totalMinutes: -1 } },
    ]);

    // Aktywne teraz
    const active = await DutySession.find({ isActive: true }).select('discordId discordUsername startTime');

    const data = stats.map((e) => ({
      discordId: e._id,
      discordUsername: e.discordUsername || e._id,
      totalMinutes: e.totalMinutes,
      sessions: e.sessions,
      lastSession: e.lastSession,
    }));

    res.json({ success: true, data, active });
  } catch (err) {
    logger.error(`getDutyStats: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * DELETE /api/duty/clear – wyczyść wszystkie godziny
 */
const clearAllDutyStats = async (req, res) => {
  try {
    const { deletedCount } = await DutySession.deleteMany({});

    await logAction('DUTY_CLEAR_ALL', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: { deletedSessions: deletedCount },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Usunięto ${deletedCount} sesji służby` });
  } catch (err) {
    logger.error(`clearAllDutyStats: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * DELETE /api/duty/clear/:discordId – wyczyść godziny dla jednego gracza
 */
const clearUserDutyStats = async (req, res) => {
  const { discordId } = req.params;
  try {
    const { deletedCount } = await DutySession.deleteMany({ discordId });

    await logAction('DUTY_CLEAR_USER', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: { discordId, deletedSessions: deletedCount },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Usunięto ${deletedCount} sesji dla gracza` });
  } catch (err) {
    logger.error(`clearUserDutyStats: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { botDutyOn, botDutyOff, botDutyStats, getDutyStats, clearAllDutyStats, clearUserDutyStats };
