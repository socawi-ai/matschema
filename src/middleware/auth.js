async function attachUser(req, _res, next) {
  if (!req.session || !req.session.userId) {
    req.currentUser = null;
    return next();
  }

  try {
    const { findUserById } = require('../db');
    const user = await findUserById(req.session.userId);
    req.currentUser = user || null;
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
