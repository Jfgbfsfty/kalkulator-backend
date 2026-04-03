const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware weryfikacji JWT access token.
 * Oczekuje nagłówka: Authorization: Bearer <token>
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Brak tokenu autoryzacji' });
    }

    const token = authHeader.split(' ')[1];

    // Weryfikuj token – rzuca błąd jeśli wygasł lub nieprawidłowy
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token wygasł', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ success: false, message: 'Nieprawidłowy token' });
    }

    // Pobierz użytkownika z bazy (sprawdź, czy istnieje i jest aktywny)
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Użytkownik nie istnieje' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Konto jest nieaktywne' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error(`Błąd autoryzacji: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Błąd serwera podczas autoryzacji' });
  }
};

module.exports = authenticate;
