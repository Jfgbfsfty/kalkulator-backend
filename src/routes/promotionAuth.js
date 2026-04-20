/**
 * /api/promotion-auth/* – Discord OAuth2 weryfikacja przed wysłaniem wniosku o awans
 *
 * Wymagane zmienne środowiskowe:
 *   DISCORD_CV_CLIENT_ID       – Client ID aplikacji Discord (ten sam co CV)
 *   DISCORD_CV_CLIENT_SECRET   – Client Secret (ten sam co CV)
 *   DISCORD_PROMO_REDIRECT_URI – np. https://twoj-backend.railway.app/api/promotion-auth/discord/callback
 *   FRONTEND_URL               – np. https://twoj-frontend.railway.app
 *   JWT_SECRET                 – ten sam sekret co reszta backendu
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const getEnv = (key, fallback = '') =>
  (process.env[key] || fallback).replace(/^["']|["']$/g, '');

const getFrontendUrl = () => {
  let url = getEnv('FRONTEND_URL', 'http://localhost:3000').trim();
  if (url !== 'http://localhost:3000' && !url.startsWith('http')) url = 'https://' + url;
  return url.replace(/\/$/, '');
};

/**
 * GET /api/promotion-auth/discord
 * Przekierowuje do Discord OAuth2
 */
router.get('/discord', (req, res) => {
  const clientId    = getEnv('DISCORD_CV_CLIENT_ID') || getEnv('DISCORD_CLIENT_ID');
  const redirectUri = getEnv('DISCORD_PROMO_REDIRECT_URI');

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      success: false,
      message: 'Discord OAuth2 nie jest skonfigurowany (brak DISCORD_CV_CLIENT_ID lub DISCORD_PROMO_REDIRECT_URI)',
    });
  }

  const params = querystring.stringify({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'identify',
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

/**
 * GET /api/promotion-auth/discord/callback
 * Discord przekierowuje tutaj po autoryzacji
 */
router.get('/discord/callback', async (req, res) => {
  const { code, error } = req.query;
  const frontendUrl = getFrontendUrl();

  if (error || !code) {
    return res.redirect(`${frontendUrl}/promotion-request#discord_error=cancelled`);
  }

  try {
    const tokenData = await exchangeCode(code);
    if (!tokenData.access_token) {
      logger.warn(`PromotionAuth Discord OAuth2: brak access_token. Odpowiedź: ${JSON.stringify(tokenData)}`);
      return res.redirect(`${frontendUrl}/promotion-request#discord_error=token`);
    }

    const user = await getDiscordUser(tokenData.access_token);
    if (!user.id) {
      return res.redirect(`${frontendUrl}/promotion-request#discord_error=user`);
    }

    // Krótkotrwały JWT z danymi Discorda (wygasa po 2h)
    const jwtSecret = getEnv('JWT_SECRET');
    const promoToken = jwt.sign(
      { discordId: user.id, discordUsername: user.username },
      jwtSecret,
      { expiresIn: '2h' }
    );

    // Hash fragment – nie trafia do serwera ani logów sieciowych
    const redirectTarget = `${frontendUrl}/promotion-request#dt=${encodeURIComponent(promoToken)}&du=${encodeURIComponent(user.username)}`;
    res.redirect(redirectTarget);
  } catch (err) {
    logger.error(`PromotionAuth Discord callback: ${err.message}`);
    res.redirect(`${frontendUrl}/promotion-request#discord_error=server`);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({
      client_id:     getEnv('DISCORD_CV_CLIENT_ID') || getEnv('DISCORD_CLIENT_ID'),
      client_secret: getEnv('DISCORD_CV_CLIENT_SECRET'),
      grant_type:    'authorization_code',
      code,
      redirect_uri:  getEnv('DISCORD_PROMO_REDIRECT_URI'),
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
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Nieprawidłowa odpowiedź token endpoint')); }
      });
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
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Nieprawidłowa odpowiedź user endpoint')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = router;
