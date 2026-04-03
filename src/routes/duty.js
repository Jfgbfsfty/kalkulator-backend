/**
 * /api/duty/* – zarządzanie godzinami służby (JWT auth, SZEF+)
 */
const express = require('express');
const router = express.Router();
const { getDutyStats, clearAllDutyStats, clearUserDutyStats } = require('../controllers/dutyController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

router.use(authenticate);

router.get('/stats', authorize('SZEF'), getDutyStats);
router.delete('/clear', authorize('SZEF'), clearAllDutyStats);
router.delete('/clear/:discordId', authorize('SZEF'), clearUserDutyStats);

module.exports = router;
