/**
 * /api/cv/* – CV na policję
 */
const express = require('express');
const router = express.Router();
const { submitCv, getCvApplications, updateCvStatus, cvValidation } = require('../controllers/cvController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { writeLimiter } = require('../middleware/rateLimiter');

// Wysyłanie CV – publiczne (bez logowania)
router.post('/', writeLimiter, cvValidation, submitCv);

// Lista i edycja statusu – tylko SZEF+
router.get('/', authenticate, authorize('SZEF'), getCvApplications);
router.put('/:id/status', authenticate, authorize('SZEF'), updateCvStatus);

module.exports = router;
