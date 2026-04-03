/**
 * RBAC – Role-Based Access Control middleware.
 * Użycie: authorize('SUPERADMIN', 'SZEF')
 * Hierarchia ról: SUPERADMIN > SZEF > POLICJANT
 */

const ROLE_HIERARCHY = {
  SUPERADMIN: 3,
  SZEF: 2,
  ZASTEPCA: 1.5,
  POLICJANT: 1,
};

/**
 * Sprawdza, czy użytkownik ma jedną z wymaganych ról.
 * Oczekuje, że middleware authenticate() już ustawił req.user.
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Nieautoryzowany' });
    }

    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const hasAccess = allowedRoles.some(
      (role) => ROLE_HIERARCHY[role] <= userRoleLevel
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Brak uprawnień do wykonania tej operacji',
      });
    }

    next();
  };
};

/**
 * Sprawdza, czy użytkownik może wykonać operację na innym użytkowniku
 * (SUPERADMIN może wszystko, SZEF może zarządzać tylko POLICJANTAMI)
 */
const canManageUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Nieautoryzowany' });
  }

  const targetUserRole = req.targetUserRole; // Ustawiane przez routing
  if (!targetUserRole) return next();

  const myLevel = ROLE_HIERARCHY[req.user.role] || 0;
  const targetLevel = ROLE_HIERARCHY[targetUserRole] || 0;

  // Nie możesz zarządzać użytkownikiem o tej samej lub wyższej roli (poza SUPERADMIN)
  if (req.user.role !== 'SUPERADMIN' && targetLevel >= myLevel) {
    return res.status(403).json({
      success: false,
      message: 'Nie możesz zarządzać użytkownikiem o tej samej lub wyższej roli',
    });
  }

  next();
};

module.exports = { authorize, canManageUser, ROLE_HIERARCHY };
