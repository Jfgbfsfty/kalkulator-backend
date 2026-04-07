const express = require('express');
const router = express.Router();
const { getSalaryConfig, updateSalaryConfig } = require('../controllers/salaryController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

// GET – publiczny odczyt stawek (potrzebny botowi bez JWT)
router.get('/', getSalaryConfig);

// PUT – tylko SZEF lub SUPERADMIN mogą zmieniać stawki
router.put('/', authenticate, authorize('SZEF'), updateSalaryConfig);

module.exports = router;
