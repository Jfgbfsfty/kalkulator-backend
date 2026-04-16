/**
 * /api/auth/2fa/* – konfiguracja i weryfikacja 2FA (tylko SUPERADMIN)
 *
 * Endpoints:
 *   POST /api/auth/2fa/setup    – generuje secret + QR code (wymaga auth)
 *   POST /api/auth/2fa/enable   – aktywuje 2FA po potwierdzeniu kodem (wymaga auth)
 *   POST /api/auth/2fa/disable  – wyłącza 2FA (wymaga auth + kodu TOTP)
 *   POST /api/auth/2fa/verify   – weryfikuje kod podczas logowania (public – używa tymczasowego tokenu)
 */

const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { authLimiter } = require('../middleware/rateLimiter');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../utils/jwt');
const RefreshToken = require('../models/RefreshToken');
const { logAction, getClientIp } = require('../middleware/auditLogger');
const logger = require('../utils/logger');

const getEnv = (key, fallback = '') =>
  (process.env[key] || fallback).replace(/^["']|["']$/g, '');

/**
 * POST /api/auth/2fa/setup
 * Generuje nowy secret TOTP i zwraca QR code (nie aktywuje jeszcze 2FA)
 */
router.post('/setup', authenticate, authorize('SUPERADMIN'), async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ length: 20 });
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret.base32,
      label: encodeURIComponent(req.user.username || 'superadmin'),
      issuer: 'Polskie RP Panel',
      encoding: 'base32',
    });
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

    await User.findByIdAndUpdate(req.user._id, { twoFactorSecret: secret.base32 });

    res.json({ success: true, qrCode: qrDataUrl, secret: secret.base32 });
  } catch (err) {
    logger.error(`2FA setup: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd generowania 2FA' });
  }
});

/**
 * POST /api/auth/2fa/enable
 * Aktywuje 2FA po potwierdzeniu kodem z aplikacji
 */
router.post('/enable', authenticate, authorize('SUPERADMIN'), async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, message: 'Wymagany kod 2FA' });

  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    if (!user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: 'Najpierw wygeneruj kod QR' });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.replace(/\s/g, ''),
      window: 1,
    });
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Nieprawidłowy kod. Spróbuj ponownie.' });
    }

    await User.findByIdAndUpdate(req.user._id, { twoFactorEnabled: true });
    logger.info(`2FA enabled for ${req.user.username}`);
    res.json({ success: true, message: '2FA zostało aktywowane.' });
  } catch (err) {
    logger.error(`2FA enable: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd aktywacji 2FA' });
  }
});

/**
 * POST /api/auth/2fa/disable
 * Wyłącza 2FA (wymaga aktualnego kodu TOTP)
 */
router.post('/disable', authenticate, authorize('SUPERADMIN'), async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, message: 'Wymagany kod 2FA' });

  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    if (!user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: '2FA nie jest aktywne' });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.replace(/\s/g, ''),
      window: 1,
    });
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Nieprawidłowy kod 2FA' });
    }

    await User.findByIdAndUpdate(req.user._id, { twoFactorEnabled: false, twoFactorSecret: null });
    logger.info(`2FA disabled for ${req.user.username}`);
    res.json({ success: true, message: '2FA zostało wyłączone.' });
  } catch (err) {
    logger.error(`2FA disable: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd wyłączania 2FA' });
  }
});

/**
 * POST /api/auth/2fa/verify
 * Weryfikuje kod TOTP podczas logowania (używa tymczasowego tokenu z login response)
 */
router.post('/verify', authLimiter, async (req, res) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) {
    return res.status(400).json({ success: false, message: 'Wymagany token i kod 2FA' });
  }

  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || 'unknown';

  try {
    // Weryfikuj tymczasowy token (ważny 5 minut)
    const jwtSecret = getEnv('JWT_SECRET');
    let payload;
    try {
      payload = jwt.verify(tempToken, jwtSecret);
    } catch {
      return res.status(401).json({ success: false, message: 'Token wygasł. Zaloguj się ponownie.' });
    }

    if (payload.type !== '2fa_pending') {
      return res.status(401).json({ success: false, message: 'Nieprawidłowy token.' });
    }

    const user = await User.findById(payload.userId).select('+twoFactorSecret');
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({ success: false, message: 'Błąd weryfikacji 2FA.' });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.replace(/\s/g, ''),
      window: 1,
    });
    if (!isValid) {
      await logAction('LOGIN_FAILED', {
        performedBy: user._id,
        performedByUsername: user.username,
        details: { reason: '2fa_wrong_code' },
        ipAddress: ip,
        userAgent: ua,
        success: false,
      });
      return res.status(401).json({ success: false, message: 'Nieprawidłowy kod 2FA.' });
    }

    // Kod poprawny – generuj pełne tokeny
    const accessToken = generateAccessToken(user._id, user.role);
    const { token: refreshToken, hashedToken } = generateRefreshToken();

    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
      tokenHash: hashedToken,
      user: user._id,
      expiresAt: refreshExpiry,
      ipAddress: ip,
      userAgent: ua,
    });

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    user.lastLogin = new Date();
    user.lastLoginIp = ip;
    await user.save();

    await logAction('LOGIN_SUCCESS', {
      performedBy: user._id,
      performedByUsername: user.username,
      ipAddress: ip,
      userAgent: ua,
    });

    logger.info(`2FA verified and logged in: ${user.username} from ${ip}`);

    res.json({
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
    logger.error(`2FA verify: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd weryfikacji 2FA' });
  }
});

module.exports = router;
