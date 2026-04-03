const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser, deleteUser, getAuditLogs, createUserValidation } = require('../controllers/userController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { generalLimiter, writeLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);
router.use(generalLimiter);

// Pobierz listę użytkowników (SZEF i wyżej)
router.get('/', authorize('SZEF'), getUsers);

// Utwórz użytkownika (SZEF i wyżej)
router.post('/', authorize('SZEF'), writeLimiter, createUserValidation, createUser);

// Edytuj użytkownika (SZEF i wyżej)
router.put('/:id', authorize('SZEF'), writeLimiter, updateUser);

// Usuń użytkownika (tylko SUPERADMIN)
router.delete('/:id', authorize('SUPERADMIN'), writeLimiter, deleteUser);

// Dziennik audytu (SZEF i wyżej)
router.get('/audit-logs', authorize('SZEF'), getAuditLogs);

module.exports = router;
