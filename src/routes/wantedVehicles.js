const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wantedVehicleController');
const authenticate = require('../middleware/authenticate');
const { generalLimiter, writeLimiter } = require('../middleware/rateLimiter');
const upload = require('../config/multer');

// Publiczny endpoint do serwowania zdjęć (bez auth – ObjectId jest losowy)
router.get('/:id/image', generalLimiter, ctrl.getImage);

router.use(authenticate);

router.get('/', generalLimiter, ctrl.getAll);
router.post('/clear-old-images', writeLimiter, ctrl.clearOldFileUrls);
router.post('/', writeLimiter, upload.single('image'), ctrl.validation, ctrl.create);
router.put('/:id', writeLimiter, upload.single('image'), ctrl.validation, ctrl.update);
router.delete('/:id', writeLimiter, ctrl.remove);

module.exports = router;
