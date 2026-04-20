/**
 * /api/promotion-requests – wnioski o awans
 */
const express = require('express');
const router = express.Router();
const {
  getAll,
  getCooldown,
  create,
  review,
  remove,
  requestValidation,
} = require('../controllers/promotionRequestController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { writeLimiter } = require('../middleware/rateLimiter');

// Cooldown – publiczny (nie wymaga logowania, identyfikacja po IP/discordId)
router.get('/my-cooldown', getCooldown);

router.use(authenticate);

// Każdy zalogowany może złożyć wniosek
router.post('/', writeLimiter, requestValidation, create);

// Przegląd i zarządzanie – tylko SZEF / SUPERADMIN
router.get('/', authorize('SZEF'), getAll);
router.put('/:id/review', authorize('SZEF'), review);
router.delete('/:id', authorize('SZEF'), remove);

module.exports = router;
