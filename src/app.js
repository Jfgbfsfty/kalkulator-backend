require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const logger = require('./utils/logger');

// Importy routerów
const authRoutes = require('./routes/auth');
const twoFactorRoutes = require('./routes/twoFactor');
const userRoutes = require('./routes/users');
const mandateRoutes = require('./routes/mandates');
const wantedPersonRoutes = require('./routes/wantedPersons');
const wantedVehicleRoutes = require('./routes/wantedVehicles');
const licenseRoutes = require('./routes/licenses');
const discordRoutes = require('./routes/discord');
const botLogRoutes = require('./routes/botLogs');
const botDutyRoutes = require('./routes/botDuty');
const dutyRoutes = require('./routes/duty');
const promotionRoutes = require('./routes/promotions');
const cvRoutes = require('./routes/cv');
const cvAuthRoutes = require('./routes/cvAuth');
const inviteRoutes = require('./routes/invite');
const salaryRoutes = require('./routes/salary');
const dismissalRoutes = require('./routes/dismissals');
const promotionRequestRoutes = require('./routes/promotionRequests');

const app = express();

// Zaufaj pierwszemu proxy (Railway, Heroku, Nginx itp.)
// Dzięki temu req.ip zwraca prawdziwe IP klienta z X-Forwarded-For
app.set('trust proxy', 1);

// ===========================
// SECURITY MIDDLEWARE
// ===========================

// Nagłówki bezpieczeństwa HTTP (XSS, clickjacking, itp.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS – tylko dozwolony frontend
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/^"|"$/g, '');
app.use(cors({
  origin: frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parser JSON z limitem rozmiaru (ochrona przed DoS)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Parsowanie ciasteczek (dla refresh token)
app.use(cookieParser());

// Logowanie requestów w trybie deweloperskim
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Sanityzacja danych – ochrona przed NoSQL injection
app.use(mongoSanitize());

// Sanityzacja danych – ochrona przed XSS
app.use(xss());

// Ochrona przed zanieczyszczeniem parametrów HTTP
app.use(hpp());

// Serwowanie uploadowanych plików (zdjęcia pojazdów)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ===========================
// ROUTES
// ===========================
app.use('/api/auth', authRoutes);
app.use('/api/auth/2fa', twoFactorRoutes);
app.use('/api/users', userRoutes);
app.use('/api/mandates', mandateRoutes);
app.use('/api/wanted-persons', wantedPersonRoutes);
app.use('/api/wanted-vehicles', wantedVehicleRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/bot-logs', botLogRoutes);
app.use('/api/bot-duty', botDutyRoutes);
app.use('/api/duty', dutyRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/cv-auth', cvAuthRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/salary-config', salaryRoutes);
app.use('/api/dismissals', dismissalRoutes);
app.use('/api/promotion-requests', promotionRequestRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ===========================
// ERROR HANDLING
// ===========================

// 404 – nie znaleziono endpointu
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint nie istnieje' });
});

// Globalny handler błędów
app.use((err, req, res, next) => {
  const status = err.status || 500;
  logger.error(`${status} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Błąd serwera' : err.message,
  });
});

module.exports = app;
