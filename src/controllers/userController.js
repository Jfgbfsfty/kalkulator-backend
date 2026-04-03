const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const logger = require('../utils/logger');

const createUserValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Nazwa użytkownika jest wymagana')
    .isLength({ min: 3, max: 30 }).withMessage('Długość 3-30 znaków')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Tylko litery, cyfry i podkreślenia'),
  body('password')
    .isLength({ min: 8, max: 100 }).withMessage('Hasło musi mieć 8-100 znaków')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Hasło musi zawierać małą i wielką literę oraz cyfrę'),
  body('role')
    .optional()
    .isIn(['SUPERADMIN', 'SZEF', 'POLICJANT']).withMessage('Nieprawidłowa rola'),
];

/**
 * GET /api/users
 * Lista użytkowników (SZEF i SUPERADMIN)
 */
const getUsers = async (req, res) => {
  try {
    const filter = {};
    // SZEF widzi tylko POLICJANTÓW i ZASTĘPCÓW
    if (req.user.role === 'SZEF') {
      filter.role = { $in: ['POLICJANT', 'ZASTEPCA'] };
    }

    const users = await User.find(filter)
      .select('-password')
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: users });
  } catch (err) {
    logger.error(`getUsers: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * POST /api/users
 * Tworzenie nowego użytkownika
 */
const createUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { username, password, role = 'POLICJANT', discordId, discordUsername } = req.body;

  // SZEF może tworzyć tylko POLICJANTÓW
  if (req.user.role === 'SZEF' && role !== 'POLICJANT') {
    return res.status(403).json({ success: false, message: 'Szef może tworzyć tylko Policjantów' });
  }
  // Tylko SUPERADMIN może tworzyć innych SUPERADMINÓW
  if (role === 'SUPERADMIN' && req.user.role !== 'SUPERADMIN') {
    return res.status(403).json({ success: false, message: 'Brak uprawnień do tworzenia Superadmina' });
  }

  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Nazwa użytkownika jest już zajęta' });
    }

    const user = await User.create({
      username,
      password,
      role,
      discordId: discordId || null,
      discordUsername: discordUsername || null,
      createdBy: req.user._id,
    });

    await logAction('CREATE_USER', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      targetUser: user._id,
      details: { username, role },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({
      success: true,
      message: 'Użytkownik utworzony pomyślnie',
      data: { id: user._id, username: user.username, role: user.role },
    });
  } catch (err) {
    logger.error(`createUser: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * PUT /api/users/:id
 * Aktualizacja użytkownika
 */
const updateUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Użytkownik nie znaleziony' });
    }

    // SZEF nie może edytować SZEFA ani SUPERADMINA
    if (req.user.role === 'SZEF' && ['SZEF', 'SUPERADMIN'].includes(target.role)) {
      return res.status(403).json({ success: false, message: 'Brak uprawnień' });
    }

    // Nie można zmienić własnej roli
    if (req.params.id === req.user._id.toString() && req.body.role) {
      return res.status(403).json({ success: false, message: 'Nie możesz zmienić własnej roli' });
    }

    const allowedFields = ['discordId', 'discordUsername', 'isActive'];
    const updateData = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    });

    // Tylko SUPERADMIN może zmieniać rolę
    if (req.body.role && req.user.role === 'SUPERADMIN') {
      updateData.role = req.body.role;
    }
    // Reset hasła
    if (req.body.newPassword) {
      if (req.body.newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Hasło musi mieć co najmniej 8 znaków' });
      }
      target.password = req.body.newPassword;
      await target.save();
    }

    const updated = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).select('-password');

    await logAction('UPDATE_USER', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      targetUser: target._id,
      details: { changes: updateData },
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    logger.error(`updateUser: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * DELETE /api/users/:id
 * Usunięcie użytkownika (tylko SUPERADMIN)
 */
const deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Nie możesz usunąć własnego konta' });
    }

    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Użytkownik nie znaleziony' });
    }

    await User.findByIdAndDelete(req.params.id);

    await logAction('DELETE_USER', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      targetUser: target._id,
      details: { username: target.username, role: target.role },
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, message: 'Użytkownik usunięty' });
  } catch (err) {
    logger.error(`deleteUser: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * GET /api/users/audit-logs
 * Dziennik audytu (SZEF i wyżej)
 */
const getAuditLogs = async (req, res) => {
  try {
    const AuditLog = require('../models/AuditLog');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.user) filter.performedByUsername = { $regex: req.query.user, $options: 'i' };
    if (req.query.success !== undefined && req.query.success !== '') {
      filter.success = req.query.success === 'true';
    }
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo + 'T23:59:59.999Z');
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('performedBy', 'username role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(`getAuditLogs: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser, getAuditLogs, createUserValidation };
