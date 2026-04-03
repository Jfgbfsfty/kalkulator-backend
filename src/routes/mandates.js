const express = require('express');
const router = express.Router();
const { getMandates, createMandate, updateMandate, deleteMandate, mandateValidation } = require('../controllers/mandateController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { generalLimiter, writeLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

// Pobierz mandaty – dostęp dla wszystkich zalogowanych
router.get('/', generalLimiter, getMandates);

// Zarządzanie mandatami – tylko SZEF i wyżej
router.post('/', authorize('SZEF'), writeLimiter, mandateValidation, createMandate);
router.put('/:id', authorize('SZEF'), writeLimiter, mandateValidation, updateMandate);
router.delete('/:id', authorize('SZEF'), writeLimiter, deleteMandate);

module.exports = router;
