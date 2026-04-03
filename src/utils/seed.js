/**
 * Skrypt seedujący bazę danych – tworzy konto SUPERADMIN i przykładowe mandaty.
 * Uruchamiasz: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Mandate = require('../models/Mandate');
const logger = require('./logger');

const seedMandates = [
  // PRĘDKOŚĆ
  { title: 'Przekroczenie prędkości 1-20 km/h', description: 'Przekroczenie dozwolonej prędkości o 1–20 km/h', price: 200, penaltyPoints: 1, category: 'PREDKOSC' },
  { title: 'Przekroczenie prędkości 21-40 km/h', description: 'Przekroczenie dozwolonej prędkości o 21–40 km/h', price: 400, penaltyPoints: 3, category: 'PREDKOSC' },
  { title: 'Przekroczenie prędkości 41-60 km/h', description: 'Przekroczenie dozwolonej prędkości o 41–60 km/h', price: 800, penaltyPoints: 6, category: 'PREDKOSC' },
  { title: 'Przekroczenie prędkości powyżej 60 km/h', description: 'Przekroczenie dozwolonej prędkości o ponad 60 km/h', price: 1500, penaltyPoints: 10, category: 'PREDKOSC' },
  // POJAZD
  { title: 'Brak OC', description: 'Brak obowiązkowego ubezpieczenia OC', price: 500, penaltyPoints: 4, category: 'POJAZD' },
  { title: 'Brak przeglądu technicznego', description: 'Przeterminowany lub brak badania technicznego', price: 300, penaltyPoints: 2, category: 'POJAZD' },
  { title: 'Niesprawne oświetlenie', description: 'Uszkodzone lub brakujące oświetlenie pojazdu', price: 200, penaltyPoints: 1, category: 'POJAZD' },
  { title: 'Jazda uszkodzonym pojazdem', description: 'Poruszanie się pojazdem stwarzającym zagrożenie', price: 400, penaltyPoints: 3, category: 'POJAZD' },
  // DOKUMENTY
  { title: 'Brak prawa jazdy', description: 'Brak uprawnienia do kierowania pojazdem', price: 1000, penaltyPoints: 5, category: 'DOKUMENTY' },
  { title: 'Brak dowodu rejestracyjnego', description: 'Brak dokumentu rejestracyjnego pojazdu', price: 250, penaltyPoints: 1, category: 'DOKUMENTY' },
  { title: 'Niezgodność tablic rejestracyjnych', description: 'Tablice niezgodne z dokumentem rejestracyjnym', price: 600, penaltyPoints: 4, category: 'DOKUMENTY' },
  // ZACHOWANIE
  { title: 'Niezatrzymanie się do kontroli', description: 'Ignorowanie sygnałów do zatrzymania pojazdu', price: 1500, penaltyPoints: 8, category: 'ZACHOWANIE' },
  { title: 'Agresja wobec funkcjonariusza', description: 'Agresywne zachowanie wobec funkcjonariusza policji', price: 2000, penaltyPoints: 10, category: 'ZACHOWANIE' },
  { title: 'Jazda pod prąd', description: 'Poruszanie się po drodze jednokierunkowej pod prąd', price: 700, penaltyPoints: 5, category: 'ZACHOWANIE' },
  { title: 'Parkowanie w miejscu niedozwolonym', description: 'Parkowanie w strefie zakazu lub na chodniku', price: 300, penaltyPoints: 1, category: 'ZACHOWANIE' },
  // ALKOHOL
  { title: 'Jazda pod wpływem alkoholu', description: 'Stan po spożyciu alkoholu podczas prowadzenia', price: 5000, penaltyPoints: 10, category: 'ALKOHOL' },
  { title: 'Odmowa badania alkomatem', description: 'Odmowa poddania się kontroli trzeźwości', price: 3000, penaltyPoints: 10, category: 'ALKOHOL' },
  // INNE
  { title: 'Brak pasów bezpieczeństwa', description: 'Jazda bez zapiętych pasów bezpieczeństwa', price: 150, penaltyPoints: 2, category: 'INNE' },
  { title: 'Używanie telefonu podczas jazdy', description: 'Korzystanie z telefonu komórkowym w trakcie jazdy', price: 350, penaltyPoints: 3, category: 'INNE' },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Połączono z bazą danych');

    // Utwórz SUPERADMIN jeśli nie istnieje
    const adminUsername = process.env.SUPERADMIN_USERNAME || 'superadmin';
    const adminPassword = process.env.SUPERADMIN_PASSWORD || 'Admin!2024Secure';

    let admin = await User.findOne({ username: adminUsername });
    if (!admin) {
      admin = await User.create({
        username: adminUsername,
        password: adminPassword,
        role: 'SUPERADMIN',
      });
      logger.info(`✅ Superadmin "${adminUsername}" utworzony`);
    } else {
      logger.info(`ℹ️ Superadmin "${adminUsername}" już istnieje`);
    }

    // Usuń istniejące mandaty i dodaj nowe (seed)
    const existing = await Mandate.countDocuments();
    if (existing === 0) {
      const mandatesWithCreator = seedMandates.map((m) => ({ ...m, createdBy: admin._id }));
      await Mandate.insertMany(mandatesWithCreator);
      logger.info(`✅ Dodano ${seedMandates.length} przykładowych mandatów`);
    } else {
      // Aktualizuj punkty karne w istniejących mandatach na podstawie tytułu
      let updated = 0;
      for (const m of seedMandates) {
        const result = await Mandate.updateOne(
          { title: m.title },
          { $set: { penaltyPoints: m.penaltyPoints } }
        );
        if (result.modifiedCount > 0) updated++;
      }
      logger.info(`✅ Zaktualizowano punkty karne w ${updated} mandatach`);
    }

    logger.info('✅ Seed zakończony pomyślnie!');
    process.exit(0);
  } catch (err) {
    logger.error(`Błąd seed: ${err.message}`);
    process.exit(1);
  }
}

seed();
