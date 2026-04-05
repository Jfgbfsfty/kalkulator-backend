const callBotApi = require('./botApi');
const logger = require('./logger');

// Konfiguracja akcji: kolor embeda + polska etykieta
const ACTION_CONFIG = {
  CREATE_MANDATE:        { color: 0x00cc66, label: '📋 Dodano mandat' },
  UPDATE_MANDATE:        { color: 0xffcc00, label: '✏️ Edytowano mandat' },
  DELETE_MANDATE:        { color: 0xff4444, label: '🗑️ Usunięto mandat' },
  CREATE_USER:           { color: 0x00cc66, label: '👤 Dodano konto' },
  UPDATE_USER:           { color: 0xffcc00, label: '✏️ Edytowano konto' },
  DELETE_USER:           { color: 0xff4444, label: '🗑️ Usunięto konto' },
  CREATE_PROMOTION:      { color: 0x00ff88, label: '🏅 Awans / Degradacja' },
  DELETE_PROMOTION:      { color: 0xff4444, label: '🗑️ Usunięto awans' },
  LOGIN:                 { color: 0x3b82f6, label: '🔑 Logowanie' },
  LOGIN_FAILED:          { color: 0xff8800, label: '⚠️ Nieudane logowanie' },
  COLLECT_LICENSE:       { color: 0xff8800, label: '📄 Zabrano prawo jazdy' },
  UPDATE_LICENSE:        { color: 0xffcc00, label: '📄 Zaktualizowano prawo jazdy' },
  CREATE_WANTED_PERSON:  { color: 0xff4444, label: '🚨 Dodano poszukiwanego' },
  UPDATE_WANTED_PERSON:  { color: 0xffcc00, label: '🚨 Zaktualizowano poszukiwanego' },
  DELETE_WANTED_PERSON:  { color: 0xff4444, label: '🚨 Usunięto poszukiwanego' },
  CREATE_WANTED_VEHICLE: { color: 0xff4444, label: '🚗 Dodano poszukiwany pojazd' },
  UPDATE_WANTED_VEHICLE: { color: 0xffcc00, label: '🚗 Zaktualizowano pojazd' },
  DELETE_WANTED_VEHICLE: { color: 0xff4444, label: '🚗 Usunięto pojazd' },
  SUBMIT_CV:             { color: 0x3b82f6, label: '📄 Nowe zgłoszenie CV' },
};

/**
 * Formatuje obiekt szczegółów jako ciąg znaków do pola embeda.
 */
const formatDetails = (details) => {
  if (!details || typeof details !== 'object') return String(details || '—');
  const lines = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `**${k}:** ${val.slice(0, 200)}`;
    });
  return lines.join('\n') || '—';
};

/**
 * Wysyła automatyczny log audytu jako embed na kanał Discord.
 * Fire-and-forget – nie blokuje odpowiedzi HTTP.
 *
 * @param {string} action          - Klucz akcji (np. 'CREATE_MANDATE')
 * @param {string} performedBy     - Username wykonawcy
 * @param {object} details         - Szczegóły akcji (klucz → wartość)
 * @param {string} [ipAddress]     - Opcjonalny adres IP wykonawcy
 */
const sendDiscordAudit = (action, performedBy, details = {}, ipAddress = null) => {
  const config = ACTION_CONFIG[action] || { color: 0x888888, label: action };

  const embed = {
    color: config.color,
    title: config.label,
    fields: [
      { name: '👤 Kto', value: String(performedBy || 'nieznany'), inline: true },
      {
        name: '🕐 Kiedy',
        value: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
        inline: true,
      },
      { name: '📌 Szczegóły', value: formatDetails(details) },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: `Kalkulator Mandatów | Polskie RP${ipAddress ? ` • IP: ${ipAddress}` : ''}`,
    },
  };

  callBotApi('/api/send-audit', { embed }).catch((err) =>
    logger.warn(`sendDiscordAudit [${action}] failed: ${err.message}`)
  );
};

module.exports = sendDiscordAudit;
