const { body, validationResult } = require('express-validator');
const Mandate = require('../models/Mandate');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const logger = require('../utils/logger');

const mandateValidation = [
  body('title').trim().notEmpty().isLength({ max: 100 }).withMessage('Tytuł wymagany (max 100 znaków)'),
  body('description').trim().notEmpty().isLength({ max: 500 }).withMessage('Opis wymagany (max 500 znaków)'),
  body('price').isFloat({ min: 0, max: 1000000 }).withMessage('Cena 0–1 000 000'),
  body('penaltyPoints').optional().isInt({ min: 0, max: 10 }).withMessage('Punkty karne 0–10'),
  body('category').isIn(['PREDKOSC', 'POJAZD', 'DOKUMENTY', 'ZACHOWANIE', 'ALKOHOL', 'INNE']).withMessage('Nieprawidłowa kategoria'),
];

/**
 * GET /api/mandates
 * Pobiera wszystkie aktywne mandaty (dostęp dla wszystkich zalogowanych)
 */
const getMandates = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.category) {
      filter.category = req.query.category;
    }

    const mandates = await Mandate.find(filter)
      .populate('createdBy', 'username')
      .sort({ category: 1, price: 1 });

    res.status(200).json({ success: true, data: mandates });
  } catch (err) {
    logger.error(`getMandates: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * POST /api/mandates
 * Tworzy nowy mandat (SZEF / SUPERADMIN)
 */
const createMandate = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const mandate = await Mandate.create({
      ...req.body,
      createdBy: req.user._id,
    });

    await logAction('CREATE_MANDATE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      targetResource: `mandate:${mandate._id}`,
      details: {
        title: mandate.title,
        description: mandate.description,
        price: mandate.price,
        penaltyPoints: mandate.penaltyPoints,
        category: mandate.category,
      },
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ success: true, data: mandate });
  } catch (err) {
    logger.error(`createMandate: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * PUT /api/mandates/:id
 * Edytuje mandat (SZEF / SUPERADMIN)
 */
const updateMandate = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const mandate = await Mandate.findById(req.params.id);
    if (!mandate) return res.status(404).json({ success: false, message: 'Mandat nie znaleziony' });

    const allowed = ['title', 'description', 'price', 'penaltyPoints', 'category', 'isActive'];
    const updateData = { updatedBy: req.user._id };
    allowed.forEach((f) => { if (req.body[f] !== undefined) updateData[f] = req.body[f]; });

    const updated = await Mandate.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

    await logAction('UPDATE_MANDATE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      targetResource: `mandate:${mandate._id}`,
      details: {
        title: mandate.title,
        before: {
          title: mandate.title,
          price: mandate.price,
          penaltyPoints: mandate.penaltyPoints,
          category: mandate.category,
          isActive: mandate.isActive,
        },
        changes: Object.fromEntries(
          Object.entries(updateData).filter(([k]) => k !== 'updatedBy')
        ),
      },
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    logger.error(`updateMandate: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * DELETE /api/mandates/:id
 * Usuwa mandat (SZEF / SUPERADMIN)
 */
const deleteMandate = async (req, res) => {
  try {
    const mandate = await Mandate.findById(req.params.id);
    if (!mandate) return res.status(404).json({ success: false, message: 'Mandat nie znaleziony' });

    await Mandate.findByIdAndDelete(req.params.id);

    await logAction('DELETE_MANDATE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      targetResource: `mandate:${mandate._id}`,
      details: { title: mandate.title, price: mandate.price, category: mandate.category, penaltyPoints: mandate.penaltyPoints },
      ipAddress: getClientIp(req),
    });

    res.status(200).json({ success: true, message: 'Mandat usunięty' });
  } catch (err) {
    logger.error(`deleteMandate: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { getMandates, createMandate, updateMandate, deleteMandate, mandateValidation };
