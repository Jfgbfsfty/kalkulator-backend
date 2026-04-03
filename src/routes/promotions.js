/**
 * /api/promotions/* – awanse i degradacje (JWT auth, ZASTEPCA+)
 */
const express = require('express');
const router = express.Router();
const {
  getPromotions,
  createPromotion,
  deletePromotion,
  promotionValidation,
} = require('../controllers/promotionController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { writeLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

// SZEF i Zastępca mogą podglądać i tworzyć
router.get('/', authorize('ZASTEPCA'), getPromotions);
router.post('/', authorize('ZASTEPCA'), writeLimiter, promotionValidation, createPromotion);

// Usuwać może tylko SZEF
router.delete('/:id', authorize('SZEF'), deletePromotion);

module.exports = router;
