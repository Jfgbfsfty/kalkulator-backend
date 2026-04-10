/**
 * /api/dismissals/* – zwolnienia ze służby (JWT auth, SZEF+)
 */
const express = require('express');
const router = express.Router();
const {
  getDismissals,
  createDismissal,
  deleteDismissal,
  dismissalValidation,
} = require('../controllers/dismissalController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { writeLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

router.get('/', authorize('SZEF'), getDismissals);
router.post('/', authorize('SZEF'), writeLimiter, dismissalValidation, createDismissal);
router.delete('/:id', authorize('SZEF'), deleteDismissal);

module.exports = router;
