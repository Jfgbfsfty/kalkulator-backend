const { body, validationResult } = require('express-validator');
const WantedPerson = require('../models/WantedPerson');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const sendDiscordAudit = require('../utils/discordAudit');
const logger = require('../utils/logger');

const validation = [
  body('nick').trim().notEmpty().isLength({ max: 50 }).withMessage('Nick wymagany (max 50 znaków)'),
  body('reason').trim().notEmpty().isLength({ max: 300 }).withMessage('Powód wymagany (max 300 znaków)'),
  body('status').optional().isIn(['POSZUKIWANY', 'ZATRZYMANY', 'ZWOLNIONY']).withMessage('Nieprawidłowy status'),
];

const getAll = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.$or = [
        { nick: { $regex: req.query.search, $options: 'i' } },
        { reason: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const persons = await WantedPerson.find(filter)
      .populate('addedBy', 'username')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: persons });
  } catch (err) {
    logger.error(`getWantedPersons: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const person = await WantedPerson.create({ ...req.body, addedBy: req.user._id });
    await logAction('CREATE_WANTED_PERSON', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: { nick: person.nick, reason: person.reason, status: person.status },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('CREATE_WANTED_PERSON', req.user.username, { 'Nick': person.nick, 'Powód': person.reason, 'Status': person.status }, getClientIp(req));
    res.status(201).json({ success: true, data: person });
  } catch (err) {
    logger.error(`createWantedPerson: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

const update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const person = await WantedPerson.findById(req.params.id);
    if (!person) return res.status(404).json({ success: false, message: 'Nie znaleziono' });

    const allowed = ['nick', 'reason', 'status', 'additionalInfo'];
    const updateData = { updatedBy: req.user._id };
    allowed.forEach((f) => { if (req.body[f] !== undefined) updateData[f] = req.body[f]; });

    const updated = await WantedPerson.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .populate('addedBy', 'username');

    await logAction('UPDATE_WANTED_PERSON', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: {
        nick: person.nick,
        before: { nick: person.nick, reason: person.reason, status: person.status },
        changes: Object.fromEntries(Object.entries(updateData).filter(([k]) => k !== 'updatedBy')),
      },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('UPDATE_WANTED_PERSON', req.user.username, { 'Nick': person.nick, 'Nowy status': updateData.status || '—', 'Zmiany': Object.entries(updateData).filter(([k]) => k !== 'updatedBy').map(([k,v]) => `${k}: ${v}`).join(', ') }, getClientIp(req));

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    logger.error(`updateWantedPerson: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

const remove = async (req, res) => {
  try {
    const person = await WantedPerson.findById(req.params.id);
    if (!person) return res.status(404).json({ success: false, message: 'Nie znaleziono' });
    await WantedPerson.findByIdAndDelete(req.params.id);
    await logAction('DELETE_WANTED_PERSON', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: { nick: person.nick, reason: person.reason, status: person.status },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('DELETE_WANTED_PERSON', req.user.username, { 'Nick': person.nick, 'Powód': person.reason }, getClientIp(req));
    res.status(200).json({ success: true, message: 'Usunięto' });
  } catch (err) {
    logger.error(`deleteWantedPerson: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { getAll, create, update, remove, validation };
