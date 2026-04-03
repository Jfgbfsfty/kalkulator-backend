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

module.exports = { authLimiter, generalLimiter, writeLimiter };
