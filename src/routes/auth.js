const express = require('express');
const bcrypt = require('bcryptjs');

const { findUserByUsername } = require('../db');
const loginRateLimiter = require('../middleware/login-rate-limit');
const { secret, text } = require('../utils/input');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.currentUser) {
    return res.redirect('/backend');
  }

  return res.render('login', { error: null });
});

router.post('/login', loginRateLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const username = (text(body.username) || text(body.email)).toLowerCase();
    const password = secret(body.password);

    if (!username || !password) {
      return res.status(400).render('login', { error: 'Användarnamn och lösenord måste fyllas i.' });
    }

    const user = await findUserByUsername(username);
    if (!user) {
      return res.status(401).render('login', { error: 'Ogiltiga inloggningsuppgifter.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).render('login', { error: 'Ogiltiga inloggningsuppgifter.' });
    }

    // New session id on login, so an id planted before login (session
    // fixation) is worthless afterwards.
    return req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      return res.redirect('/backend');
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    res.clearCookie('matschema.sid');
    return res.redirect('/frontend');
  });
});

module.exports = router;
