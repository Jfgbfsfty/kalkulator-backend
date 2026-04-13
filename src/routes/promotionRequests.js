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

router.use(authenticate);

// Każdy zalogowany może sprawdzić cooldown i złożyć wniosek
router.get('/my-cooldown', getCooldown);
router.post('/', writeLimiter, requestValidation, create);

// Przegląd i zarządzanie – tylko SZEF / SUPERADMIN
router.get('/', authorize('SZEF'), getAll);
router.put('/:id/review', authorize('SZEF'), review);
router.delete('/:id', authorize('SZEF'), remove);

module.exports = router;
