const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Nowoczesne wersje mongoose nie wymagają już dodatkowych opcji
    });
    logger.info(`MongoDB połączony: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`Błąd połączenia z MongoDB: ${err.message}`);
    process.exit(1);
  }
};

// Obsługa zdarzeń połączenia
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB: rozłączono');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB: ponowne połączenie');
});

module.exports = connectDB;
