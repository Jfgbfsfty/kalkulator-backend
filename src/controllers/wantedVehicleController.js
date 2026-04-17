const { body, validationResult } = require('express-validator');
const WantedVehicle = require('../models/WantedVehicle');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const sendDiscordAudit = require('../utils/discordAudit');
const logger = require('../utils/logger');

const validation = [
  body('model').trim().notEmpty().isLength({ max: 80 }).withMessage('Model wymagany (max 80 znaków)'),
  body('owner').trim().notEmpty().isLength({ max: 50 }).withMessage('Właściciel wymagany (max 50 znaków)'),
  body('reason').trim().notEmpty().isLength({ max: 300 }).withMessage('Powód wymagany (max 300 znaków)'),
  body('status').optional().isIn(['POSZUKIWANY', 'ZATRZYMANY', 'ZWOLNIONY']).withMessage('Nieprawidłowy status'),
];

const getAll = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.$or = [
        { model: { $regex: req.query.search, $options: 'i' } },
        { owner: { $regex: req.query.search, $options: 'i' } },
        { licensePlate: { $regex: req.query.search, $options: 'i' } },
      ];
    }
    const vehicles = await WantedVehicle.find(filter)
      .select('-imageData')
      .populate('addedBy', 'username')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: vehicles });
  } catch (err) {
    logger.error(`getWantedVehicles: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  try {
    const data = { ...req.body, addedBy: req.user._id };
    if (req.file) {
      data.imageData = req.file.buffer;
      data.imageMimeType = req.file.mimetype;
    }
    const vehicle = await WantedVehicle.create(data);
    const vehicleOut = vehicle.toObject();
    delete vehicleOut.imageData;
    await logAction('CREATE_WANTED_VEHICLE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: { model: vehicle.model, owner: vehicle.owner, licensePlate: vehicle.licensePlate, reason: vehicle.reason, status: vehicle.status },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('CREATE_WANTED_VEHICLE', req.user.username, { 'Model': vehicle.model, 'Właściciel': vehicle.owner, 'Nr rejestracyjny': vehicle.licensePlate || '—', 'Powód': vehicle.reason }, getClientIp(req));
    res.status(201).json({ success: true, data: vehicleOut });
  } catch (err) {
    logger.error(`createWantedVehicle: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

const update = async (req, res) => {
  try {
    const vehicle = await WantedVehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Nie znaleziono' });
    }
    const allowed = ['model', 'licensePlate', 'owner', 'reason', 'status'];
    const updateData = { updatedBy: req.user._id };
    allowed.forEach((f) => { if (req.body[f] !== undefined) updateData[f] = req.body[f]; });
    if (req.file) {
      updateData.imageData = req.file.buffer;
      updateData.imageMimeType = req.file.mimetype;
    }
    if (req.body.removeImage === 'true' && !req.file) {
      updateData.imageData = null;
      updateData.imageMimeType = null;
    }
    const updated = await WantedVehicle.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .populate('addedBy', 'username');
    await logAction('UPDATE_WANTED_VEHICLE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: {
        model: vehicle.model,
        before: { model: vehicle.model, owner: vehicle.owner, licensePlate: vehicle.licensePlate, reason: vehicle.reason, status: vehicle.status },
        changes: Object.fromEntries(Object.entries(updateData).filter(([k]) => k !== 'updatedBy')),
      },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('UPDATE_WANTED_VEHICLE', req.user.username, { 'Model': vehicle.model, 'Nowy status': updateData.status || '—', 'Zmiany': Object.entries(updateData).filter(([k]) => k !== 'updatedBy').map(([k,v]) => `${k}: ${v}`).join(', ') }, getClientIp(req));
    const updatedOut = updated.toObject();
    delete updatedOut.imageData;
    res.status(200).json({ success: true, data: updatedOut });
  } catch (err) {
    logger.error(`updateWantedVehicle: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

const remove = async (req, res) => {
  try {
    const vehicle = await WantedVehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Nie znaleziono' });
    await WantedVehicle.findByIdAndDelete(req.params.id);
    await logAction('DELETE_WANTED_VEHICLE', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      performedByDiscordId: req.user.discordId || null,
      performedByDiscordUsername: req.user.discordUsername || null,
      details: { model: vehicle.model, owner: vehicle.owner, licensePlate: vehicle.licensePlate, status: vehicle.status },
      ipAddress: getClientIp(req),
    });
    sendDiscordAudit('DELETE_WANTED_VEHICLE', req.user.username, { 'Model': vehicle.model, 'Właściciel': vehicle.owner, 'Nr rej.': vehicle.licensePlate || '—' }, getClientIp(req));
    res.status(200).json({ success: true, message: 'Usunięto' });
  } catch (err) {
    logger.error(`deleteWantedVehicle: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

// Wyczyść stare imageUrl które są ścieżkami do plików (nie base64)
const clearOldFileUrls = async (req, res) => {
  try {
    const result = await WantedVehicle.updateMany(
      { imageUrl: { $regex: '^/uploads/', $options: 'i' } },
      { $set: { imageUrl: null } }
    );
    res.json({ success: true, cleared: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Serwuj zdjęcie pojazdu (publiczny endpoint – ObjectId jest praktycznie nie do zgadnięcia)
const getImage = async (req, res) => {
  try {
    const vehicle = await WantedVehicle.findById(req.params.id).select('imageData imageMimeType');
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Nie znaleziono pojazdu' });
    }
    if (!vehicle.imageData || vehicle.imageData.length === 0) {
      return res.status(404).json({ success: false, message: 'Brak zdjęcia' });
    }
    const buf = Buffer.from(vehicle.imageData);
    res.set('Content-Type', vehicle.imageMimeType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Length', buf.length);
    res.end(buf);
  } catch (err) {
    logger.error(`getImage: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { getAll, create, update, remove, validation, clearOldFileUrls, getImage };
