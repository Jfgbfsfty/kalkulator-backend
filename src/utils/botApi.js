const axios = require('axios');
const logger = require('./logger');

/**
 * Calls the Discord bot's HTTP API from the backend.
 * Used for sending Discord messages, manage roles etc.
 */
const callBotApi = async (endpoint, data = {}, method = 'POST') => {
  const botUrl = process.env.BOT_API_URL || 'http://localhost:3001';
  const secret = process.env.BOT_API_SECRET;

  const response = await axios({
    method,
    url: `${botUrl}${endpoint}`,
    data: method !== 'GET' ? data : undefined,
    params: method === 'GET' ? data : undefined,
    headers: {
      'Content-Type': 'application/json',
      'x-bot-secret': secret,
    },
    timeout: 5000,
  });
  return response.data;
};

module.exports = callBotApi;
