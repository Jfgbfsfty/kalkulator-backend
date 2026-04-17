/**
 * /api/invite – jednorazowe linki rejestracyjne
 *
 * Flow:
 * 1. POST /api/invite          (SZEF) → generuje token, zwraca link
 * 2. GET  /api/invite/:token   (public) → sprawdza ważność tokenu
 * 3. GET  /api/invite/:token/discord → redirect do Discord OAuth2
 * 4. GET  /api/invite/discord/callback → wymiana kodu, zapis discordId do sesji, redirect do frontend
 * 5. POST /api/invite/:token/register → tworzy konto użytkownika z discordId + hasłem
 * 6. GET  /api/invite/list     (SZEF) → lista wygenerowanych linków
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const InviteLink = require('../models/InviteLink');
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { writeLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

const getEnv = (key, fallback = '') =>
  (process.env[key] || fallback).replace(/^["']|["']$/g, '');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function exchangeDiscordCode(code) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({
      client_id:     getEnv('DISCORD_CV_CLIENT_ID') || getEnv('DISCORD_CLIENT_ID'),
      client_secret: getEnv('DISCORD_CV_CLIENT_SECRET'),
      grant_type:    'authorization_code',
      code,
      redirect_uri:  getEnv('INVITE_DISCORD_REDIRECT_URI'),
    });
    const options = {
      hostname: 'discord.com',
      port: 443,
      path: '/api/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Błąd parsowania odpowiedzi Discord')); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getDiscordUser(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'discord.com',
      port: 443,
      path: '/api/users/@me',
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Błąd parsowania danych użytkownika')); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/invite
 * Generuje nowy jednorazowy link rejestracyjny (tylko SZEF+)
 */
router.post('/', authenticate, authorize('SZEF'), writeLimiter, async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dni

    await InviteLink.create({ token, createdBy: req.user._id, expiresAt });

    const frontendUrl = getEnv('FRONTEND_URL', 'http://localhost:3000');
    const link = `${frontendUrl}/invite/${token}`;

    logger.info(`Invite link created by ${req.user.username}`);
    res.json({ success: true, link, token, expiresAt });
  } catch (err) {
    logger.error(`Create invite: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd tworzenia linku' });
  }
});

/**
 * GET /api/invite/list
 * Lista linków (tylko SZEF+)
 */
router.get('/list', authenticate, authorize('SZEF'), async (req, res) => {
  try {
    const links = await InviteLink.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('createdBy', 'username')
      .populate('usedBy', 'username');
    res.json({ success: true, data: links });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Błąd pobierania linków' });
  }
});

/**
 * GET /api/invite/:token
 * Sprawdź czy token jest ważny (public)
 */
router.get('/:token', async (req, res) => {
  try {
    const invite = await InviteLink.findOne({ token: req.params.token });
    if (!invite) return res.status(404).json({ success: false, message: 'Link nie istnieje.' });
    if (invite.used) return res.status(410).json({ success: false, message: 'Ten link został już wykorzystany.' });
    if (invite.expiresAt < new Date()) return res.status(410).json({ success: false, message: 'Ten link wygasł.' });
    res.json({ success: true, expiresAt: invite.expiresAt });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
});

/**
 * GET /api/invite/:token/discord
 * Redirect do Discord OAuth2 z token w state
 */
router.get('/:token/discord', async (req, res) => {
  const { token } = req.params;

  const invite = await InviteLink.findOne({ token });
  if (!invite || invite.used || invite.expiresAt < new Date()) {
    const frontendUrl = getEnv('FRONTEND_URL', 'http://localhost:3000');
    return res.redirect(`${frontendUrl}/invite/${token}?error=invalid`);
  }

  const clientId  = getEnv('DISCORD_CV_CLIENT_ID') || getEnv('DISCORD_CLIENT_ID');
  const redirectUri = getEnv('INVITE_DISCORD_REDIRECT_URI');

  const params = querystring.stringify({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state: token, // przekazujemy token przez state
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

/**
 * GET /api/invite/discord/callback
 * Discord callback – wymienia kod na access_token, tworzy krótki JWT z danymi Discord
 */
router.get('/discord/callback', async (req, res) => {
  const { code, state: token, error } = req.query;
  const frontendUrl = getEnv('FRONTEND_URL', 'http://localhost:3000');

  if (error || !code || !token) {
    return res.redirect(`${frontendUrl}/invite/${token || ''}?error=cancelled`);
  }

  try {
    const tokenData = await exchangeDiscordCode(code);
    if (!tokenData.access_token) {
      return res.redirect(`${frontendUrl}/invite/${token}?error=token`);
    }

    const discordUser = await getDiscordUser(tokenData.access_token);
    if (!discordUser.id) {
      return res.redirect(`${frontendUrl}/invite/${token}?error=user`);
    }

    // Sprawdź czy Discord ID jest już używany
    const existing = await User.findOne({ discordId: discordUser.id });
    if (existing) {
      return res.redirect(`${frontendUrl}/invite/${token}?error=discord_taken`);
    }

    // Krótkotrwały JWT z danymi Discord (15 minut)
    const jwtSecret = getEnv('JWT_SECRET');
    const discordJwt = jwt.sign(
      { discordId: discordUser.id, discordUsername: discordUser.username, inviteToken: token },
      jwtSecret,
      { expiresIn: '15m' }
    );

    res.redirect(
      `${frontendUrl}/invite/${token}?discord_token=${encodeURIComponent(discordJwt)}&discord_username=${encodeURIComponent(discordUser.username)}`
    );
  } catch (err) {
    logger.error(`Invite Discord callback: ${err.message}`);
    res.redirect(`${frontendUrl}/invite/${token}?error=server`);
  }
});

/**
 * POST /api/invite/:token/register
 * Tworzy konto użytkownika (public – tylko z ważnym tokenem + discord JWT)
 */
router.post(
  '/:token/register',
  writeLimiter,
  [
    body('password')
      .isLength({ min: 8 }).withMessage('Hasło musi mieć co najmniej 8 znaków')
      .matches(/[A-Z]/).withMessage('Hasło musi zawierać dużą literę')
      .matches(/[0-9]/).withMessage('Hasło musi zawierać cyfrę'),
    body('discordToken').notEmpty().withMessage('Wymagana weryfikacja Discord'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { token } = req.params;
    const { password, discordToken } = req.body;

    // Weryfikuj JWT Discord
    let discordId, discordUsername;
    try {
      const jwtSecret = getEnv('JWT_SECRET');
      const payload = jwt.verify(discordToken, jwtSecret);
      if (payload.inviteToken !== token) {
        return res.status(401).json({ success: false, message: 'Token Discord nie pasuje do linku.' });
      }
      discordId = payload.discordId;
      discordUsername = payload.discordUsername;
    } catch {
      return res.status(401).json({ success: false, message: 'Sesja Discord wygasła. Zaloguj się przez Discord ponownie.' });
    }

    // Weryfikuj link
    const invite = await InviteLink.findOne({ token });
    if (!invite) return res.status(404).json({ success: false, message: 'Link nie istnieje.' });
    if (invite.used) return res.status(410).json({ success: false, message: 'Ten link został już wykorzystany.' });
    if (invite.expiresAt < new Date()) return res.status(410).json({ success: false, message: 'Ten link wygasł.' });

    // Sprawdź czy Discord ID już istnieje
    const existingDiscord = await User.findOne({ discordId });
    if (existingDiscord) {
      return res.status(409).json({ success: false, message: 'To konto Discord jest już zarejestrowane.' });
    }

    try {
      // Utwórz użytkownika – username = discordUsername (sanityzowany)
      const safeUsername = discordUsername.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30);
      // Upewnij się że username jest unikalny
      let username = safeUsername;
      let suffix = 1;
      while (await User.findOne({ username })) {
        username = `${safeUsername}_${suffix++}`;
      }

      const newUser = await User.create({
        username,
        password,
        role: 'POLICJANT',
        discordId,
        discordUsername,
        createdBy: invite.createdBy,
      });

      // Oznacz link jako wykorzystany
      invite.used = true;
      invite.usedBy = newUser._id;
      invite.usedAt = new Date();
      await invite.save();

      logger.info(`User registered via invite: ${username} (Discord: ${discordUsername})`);
      res.status(201).json({
        success: true,
        message: 'Konto zostało utworzone. Możesz się teraz zalogować.',
        username,
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ success: false, message: 'Nazwa użytkownika jest już zajęta.' });
      }
      logger.error(`Register via invite: ${err.message}`);
      res.status(500).json({ success: false, message: 'Błąd tworzenia konta.' });
    }
  }
);

/**
 * DELETE /api/invite/:token
 * Usuń/unieważnij link (tylko SZEF+)
 */
router.delete('/:token', authenticate, authorize('SZEF'), async (req, res) => {
  try {
    await InviteLink.deleteOne({ token: req.params.token });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Błąd usuwania linku' });
  }
});

module.exports = router;
