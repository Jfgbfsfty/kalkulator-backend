require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

// Połącz z bazą danych, następnie uruchom serwer
connectDB().then(() => {
  const server = app.listen(PORT, () => {
    logger.info(`Serwer uruchomiony na porcie ${PORT} [${process.env.NODE_ENV}]`);
  });

  // Obsługa nieoczekiwanych odrzuceń Promise
  process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`);
    server.close(() => process.exit(1));
  });

  // Obsługa nieprzechwyconych wyjątków
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM otrzymany. Zamykanie serwera...');
    server.close(() => {
      logger.info('Serwer zamknięty');
      process.exit(0);
    });
  });
});
