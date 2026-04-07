const SalaryConfig = require('../models/SalaryConfig');
const { RANKS } = require('../models/SalaryConfig');
const logger = require('../utils/logger');

/**
 * GET /api/salary-config
 * Zwraca stawki godzinowe dla wszystkich stopni.
 * Dostęp publiczny – czytają to bot i panel admina.
 */
const getSalaryConfig = async (req, res) => {
  try {
    const configs = await SalaryConfig.find({}).lean();

    // Zwróć wszystkie rangi, uzupełniając brakujące domyślną wartością 0
    const data = RANKS.map((rankName) => {
      const entry = configs.find((c) => c.rankName === rankName);
      return {
        rankName,
        hourlyRate: entry?.hourlyRate ?? 0,
        updatedAt: entry?.updatedAt ?? null,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    logger.error(`getSalaryConfig: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

/**
 * PUT /api/salary-config
 * Aktualizuje stawki godzinowe dla podanych stopni.
 * Wymaga roli SZEF lub wyżej.
 * Body: [{ rankName, hourlyRate }]
 */
const updateSalaryConfig = async (req, res) => {
  const updates = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Body musi być tablicą obiektów { rankName, hourlyRate }',
    });
  }

  try {
    for (const entry of updates) {
      const { rankName, hourlyRate } = entry;
      if (!RANKS.includes(rankName)) continue;
      const rate = Number(hourlyRate);
      if (isNaN(rate) || rate < 0) continue;

      await SalaryConfig.findOneAndUpdate(
        { rankName },
        { rankName, hourlyRate: rate, updatedBy: req.user._id },
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, message: 'Stawki zaktualizowane' });
  } catch (err) {
    logger.error(`updateSalaryConfig: ${err.message}`);
    res.status(500).json({ success: false, message: 'Błąd serwera' });
  }
};

module.exports = { getSalaryConfig, updateSalaryConfig };
