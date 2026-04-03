const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Generuje access token JWT (krótki czas życia)
 */
const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m' }
  );
};

/**
 * Generuje refresh token (losowy token + hash do bazy)
 */
const generateRefreshToken = () => {
  const token = crypto.randomBytes(64).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hashedToken };
};

/**
 * Weryfikuje access token JWT
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

/**
 * Hashuje refresh token przed zapisem do bazy
 */
const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken, hashRefreshToken };
