const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wantedPersonController');
const authenticate = require('../middleware/authenticate');
const { generalLimiter, writeLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

router.get('/', generalLimiter, ctrl.getAll);
router.post('/', writeLimiter, ctrl.validation, ctrl.create);
router.put('/:id', writeLimiter, ctrl.validation, ctrl.update);
router.delete('/:id', writeLimiter, ctrl.remove);

module.exports = router;
