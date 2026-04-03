const express = require('express');
const router = express.Router();
const { assignRole, removeRole, sendLog, getGuildRoles, roleValidation } = require('../controllers/discordController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { writeLimiter, generalLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);
router.use(authorize('SZEF')); // Tylko SZEF i SUPERADMIN

router.post('/assign-role', writeLimiter, roleValidation, assignRole);
router.post('/remove-role', writeLimiter, roleValidation, removeRole);
router.post('/send-log', writeLimiter, sendLog);
router.get('/guild-roles', generalLimiter, getGuildRoles);

module.exports = router;
