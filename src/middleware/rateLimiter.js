const rateLimit = require('express-rate-limit');

/**
 * Agresywny rate limiter dla endpointów uwierzytelniania
 * (ochrona przed brute-force atakami)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 10, // Maksymalnie 10 prób na IP
  skipSuccessfulRequests: true, // Nie licz udanych logowań
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.',
  },
});

/**
 * Ogólny rate limiter dla pozostałych endpointów API
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuta
  max: 100, // 100 requestów na minutę
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Zbyt wiele requestów. Spróbuj ponownie za chwilę.',
  },
});

/**
 * Rate limiter dla endpointów modyfikujących dane (POST/PUT/DELETE)
 */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Zbyt wiele operacji zapisu. Spróbuj ponownie za chwilę.',
  },
});

/**
 * Rate limiter dla formularza CV – max 1 zgłoszenie na 24h per IP
 * keyGenerator ręcznie czyta X-Forwarded-For żeby działać za każdym proxy
 */
const cvLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 godziny
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      // Pierwszy adres w X-Forwarded-For to oryginalny klient
      return xff.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip;
  },
  skip: () => false, // nigdy nie pomijaj
  message: {
    success: false,
    message: 'Możesz wysłać tylko jedno CV na 24 godziny. Spróbuj ponownie jutro.',
  },
});

module.exports = { authLimiter, generalLimiter, writeLimiter, cvLimiter };
