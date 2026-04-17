const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser, deleteUser, getAuditLogs, getNotifications, createUserValidation } = require('../controllers/userController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { generalLimiter, writeLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);
router.use(generalLimiter);

// Pobierz listę użytkowników (SZEF i wyżej)
router.get('/', authorize('SZEF'), getUsers);

// Wyszukaj użytkownika po username/discordUsername (ZASTEPCA i wyżej)
router.get('/search', authorize('ZASTEPCA'), async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ success: true, data: [] });
  try {
    const User = require('../models/User');
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { discordUsername: { $regex: q, $options: 'i' } },
      ],
    })
      .select('username discordId discordUsername role')
      .limit(10)
      .lean();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Błąd wyszukiwania' });
  }
});

// Utwórz użytkownika (SZEF i wyżej)
router.post('/', authorize('SZEF'), writeLimiter, createUserValidation, createUser);

// Edytuj użytkownika (SZEF i wyżej)
router.put('/:id', authorize('SZEF'), writeLimiter, updateUser);

// Usuń użytkownika (tylko SUPERADMIN)
router.delete('/:id', authorize('SUPERADMIN'), writeLimiter, deleteUser);

// Dziennik audytu (SZEF i wyżej)
router.get('/audit-logs', authorize('SZEF'), getAuditLogs);

// Powiadomienia – wszyscy zalogowani
router.get('/notifications', getNotifications);

module.exports = router;
