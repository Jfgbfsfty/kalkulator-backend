const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../utils/jwt');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const sendDiscordAudit = require('../utils/discordAudit');
const logger = require('../utils/logger');

// Reguły walidacji dla logowania
const loginValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Nazwa użytkownika jest wymagana')
    .isLength({ min: 3, max: 30 }).withMessage('Nieprawidłowa długość nazwy użytkownika')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Nieprawidłowe znaki w nazwie użytkownika'),
  body('password')
    .notEmpty().withMessage('Hasło jest wymagane')
    .isLength({ min: 8, max: 100 }).withMessage('Hasło musi mieć 8-100 znaków'),
];

/**
 * POST /api/auth/login
 * Loguje użytkownika, zwraca access token + ustawia refresh token w httpOnly cookie
 */
const login = async (req, res) => {
  // Sprawdź błędy walidacji
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { username, password } = req.body;
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || 'unknown';

  try {
    // Pobierz użytkownika razem z hasłem (pole select: false)
    const user = await User.findOne({ username }).select('+password +failedLoginAttempts +lockedUntil');

    // Nie ujawniaj czy username istnieje (ochrona przed enumeration)
    if (!user) {
      await logAction('LOGIN_FAILED', {
        performedBy: null,
        performedByUsername: username,
        details: { reason: 'user_not_found' },
        ipAddress: ip,
        userAgent: ua,
        success: false,
      });
      return res.status(401).json({ success: false, message: 'Nieprawidłowe dane logowania' });
    }

    // Sprawdź, czy konto jest aktywne
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Konto jest nieaktywne' });
    }

    // Weryfikacja hasła
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incFailedLogins();
      await logAction('LOGIN_FAILED', {
        performedBy: user._id,
        performedByUsername: user.username,
        details: { reason: 'wrong_password', attempts: user.failedLoginAttempts },
        ipAddress: ip,
        userAgent: ua,
        success: false,
      });
      return res.status(401).json({ success: false, message: 'Nieprawidłowe dane logowania' });
    }

    // Zresetuj licznik i zapisz ostatnie logowanie
    await user.resetFailedLogins();
    user.lastLogin = new Date();
    user.lastLoginIp = ip;
    await user.save();

    // Generuj tokeny
    const accessToken = generateAccessToken(user._id, user.role);
    const { token: refreshToken, hashedToken } = generateRefreshToken();

    // Zapisz zHashowany refresh token do bazy
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dni
    await RefreshToken.create({
      tokenHash: hashedToken,
      user: user._id,
      expiresAt: refreshExpiry,
      ipAddress: ip,
      userAgent: ua,
    });

    // Ustaw refresh token w httpOnly cookie (nie dostępny przez JS – ochrona XSS)
    // SameSite=None wymagane bo frontend i backend są na różnych subdomenach up.railway.app (PSL)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dni w ms
      path: '/api/auth',
    });

    await logAction('LOGIN_SUCCESS', {
      performedBy: user._id,
      performedByUsername: user.username,
      ipAddress: ip,
      userAgent: ua,
    });
    sendDiscordAudit('LOGIN', user.username, { 'Konto': user.username, 'Rola': user.role }, ip);

    logger.info(`Zalogowano: ${user.username} [${user.role}] z IP: ${ip}`);;

    res.status(200).json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
      },
    });
  } catch (err) {
    logger.error(`Błąd logowania: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * POST /api/auth/refresh
 * Odświeża access token używając refresh token z cookie
 */
const refreshToken = async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Brak refresh tokenu' });
  }

  try {
    const hashedToken = hashRefreshToken(token);
    const storedToken = await RefreshToken.findOne({
      tokenHash: hashedToken,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }).populate('user');

    if (!storedToken || !storedToken.user) {
      return res.status(401).json({ success: false, message: 'Nieprawidłowy refresh token' });
    }

    const user = storedToken.user;

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Konto jest nieaktywne' });
    }

    // Generuj nowy access token
    const newAccessToken = generateAccessToken(user._id, user.role);

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
      },
    });
  } catch (err) {
    logger.error(`Błąd refresh token: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * POST /api/auth/logout
 * Unieważnia refresh token i czyści cookie
 */
const logout = async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    try {
      const hashedToken = hashRefreshToken(token);
      await RefreshToken.findOneAndUpdate({ tokenHash: hashedToken }, { isRevoked: true });
    } catch (err) {
      logger.error(`Błąd wylogowania: ${err.message}`);
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('refreshToken', {
    path: '/api/auth',
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });

  if (req.user) {
    await logAction('LOGOUT', {
      performedBy: req.user._id,
      performedByUsername: req.user.username,
      ipAddress: getClientIp(req),
    });
  }

  res.status(200).json({ success: true, message: 'Wylogowano pomyślnie' });
};

/**
 * GET /api/auth/me
 * Zwraca dane zalogowanego użytkownika
 */
const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role,
      discordId: req.user.discordId,
      discordUsername: req.user.discordUsername,
      lastLogin: req.user.lastLogin,
      createdAt: req.user.createdAt,
    },
  });
};

module.exports = { login, refreshToken, logout, getMe, loginValidation };
