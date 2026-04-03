const { body, validationResult } = require('express-validator');
const CollectedLicense = require('../models/CollectedLicense');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const logger = require('../utils/logger');

const validation = [
  body('nick').trim().notEmpty().isLength({ max: 50 }).withMessage('Nick wymagany'),
  body('reason').trim().notEmpty().isLength({ max: 300 }).withMessage('Powód wymagany'),
  body('collectedAt').optional().isISO8601().withMessage('Nieprawidłowy format daty'),
];

const getAll = async (req, res) => {
  try {
    const filter = {};
    if (req.query.isReturned !== undefined) filter.isReturned = req.query.isReturned === 'true';
    if (req.query.search) {
      filter.$or = [
        { nick: { $regex: req.query.search, $options: 'i' } },
        { reason: { $regex: req.query.search, $options: 'i' } },
      ];
    }
    const licenses = await CollectedLicense.find(filter)
      .populate('takenBy', 'username')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: licenses });
  } catch (err) {
    logger.error(`getLicenses: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const license = await CollectedLicense.create({ ...req.body, takenBy: req.user._id });
    await logAction('COLLECT_LICENSE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: { nick: license.nick, reason: license.reason },
      ipAddress: getClientIp(req),
    });
    const populated = await CollectedLicense.findById(license._id).populate('takenBy', 'username');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    logger.error(`createLicense: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

const update = async (req, res) => {
  try {
    const license = await CollectedLicense.findById(req.params.id);
    if (!license) return res.status(404).json({ success: false, message: 'Nie znaleziono' });
    const allowed = ['nick', 'reason', 'isReturned', 'returnDate', 'notes'];
    const updateData = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updateData[f] = req.body[f]; });
    const updated = await CollectedLicense.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .populate('takenBy', 'username');
    await logAction('UPDATE_LICENSE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: {
        nick: license.nick,
        before: { nick: license.nick, reason: license.reason, isReturned: license.isReturned },
        changes: updateData,
      },
      ipAddress: getClientIp(req),
    });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    logger.error(`updateLicense: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

const remove = async (req, res) => {
  try {
    const license = await CollectedLicense.findById(req.params.id);
    if (!license) return res.status(404).json({ success: false, message: 'Nie znaleziono' });
    await CollectedLicense.findByIdAndDelete(req.params.id);
    await logAction('DELETE_LICENSE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      details: { nick: license.nick, reason: license.reason, isReturned: license.isReturned },
      ipAddress: getClientIp(req),
    });
    res.status(200).json({ success: true, message: 'Usunięto' });
  } catch (err) {
    logger.error(`deleteLicense: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { getAll, create, update, remove, validation };
