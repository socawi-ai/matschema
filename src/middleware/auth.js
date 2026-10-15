async function attachUser(req, _res, next) {
  if (!req.session || !req.session.userId) {
    req.currentUser = null;
    return next();
  }

  try {
    const { findUserById } = require('../db');
    const user = await findUserById(req.session.userId);
    // A session from before the last password change is logged out.
    // Sessions saved before session versions existed count as version 0.
    if (!user || (req.session.sessionVersion || 0) !== user.session_version) {
      delete req.session.userId;
      req.currentUser = null;
      return next();
    }
    req.currentUser = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAuth(req, res, next) {
  if (req.currentUser) {
    return next();
  }
  return res.redirect('/auth/login');
}

module.exports = {
  attachUser,
  requireAuth
};
