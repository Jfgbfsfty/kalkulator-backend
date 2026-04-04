/**
 * /api/bot-duty/* – endpointy wywoływane przez bota Discord (x-bot-secret auth)
 */
const express = require('express');
const router = express.Router();
const { botDutyOn, botDutyOff, botDutyStats } = require('../controllers/dutyController');

const verifyBotSecret = (req, res, next) => {
  const secret = req.headers['x-bot-secret'];
  const expected = (process.env.BOT_API_SECRET || '').replace(/^["']|["']$/g, '');
  if (!secret || secret !== expected) {
    return res.status(401).json({ success: false, message: 'Nieautoryzowany dostęp do Bot API' });
  }
  next();
};

router.use(verifyBotSecret);

router.post('/on', botDutyOn);
router.post('/off', botDutyOff);
router.get('/stats', botDutyStats);

module.exports = router;
