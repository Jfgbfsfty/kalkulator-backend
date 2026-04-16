const express = require('express');
const router = express.Router();
const { submitCv, getCvApplications, updateCvStatus, botUpdateCvStatus, cvValidation } = require('../controllers/cvController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { cvLimiter } = require('../middleware/rateLimiter');

// Wysyłanie CV – publiczne, 1 na 24h per IP
router.post('/', cvLimiter, cvValidation, submitCv);

// Lista i edycja statusu – tylko SZEF+
router.get('/', authenticate, authorize('SZEF'), getCvApplications);
router.put('/:id/status', authenticate, authorize('SZEF'), updateCvStatus);

// Aktualizacja przez bota (x-bot-secret, bez JWT)
router.put('/:id/bot-review', botUpdateCvStatus);

module.exports = router;
