const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wantedVehicleController');
const authenticate = require('../middleware/authenticate');
const { generalLimiter, writeLimiter } = require('../middleware/rateLimiter');
const upload = require('../config/multer');

router.use(authenticate);

router.get('/', generalLimiter, ctrl.getAll);
router.post('/', writeLimiter, upload.single('image'), ctrl.validation, ctrl.create);
router.put('/:id', writeLimiter, upload.single('image'), ctrl.validation, ctrl.update);
router.delete('/:id', writeLimiter, ctrl.remove);

module.exports = router;
