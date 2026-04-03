const express = require('express');
const router = express.Router();
const { login, refreshToken, logout, getMe, loginValidation } = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const { authLimiter } = require('../middleware/rateLimiter');

// Logowanie – rate limited (ochrona przed brute-force)
router.post('/login', authLimiter, loginValidation, login);

// Odświeżanie access tokenu (używa httpOnly cookie)
router.post('/refresh', refreshToken);

// Wylogowanie
router.post('/logout', authenticate, logout);

// Dane zalogowanego użytkownika
router.get('/me', authenticate, getMe);

module.exports = router;
