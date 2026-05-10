const express = require('express');
const bcrypt = require('bcryptjs');

const { findUserByEmail } = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.currentUser) {
    return res.redirect('/backend');
  }

  return res.render('login', { error: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!email || !password) {
      return res.status(400).render('login', { error: 'E-post och lösenord måste fyllas i.' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).render('login', { error: 'Ogiltiga inloggningsuppgifter.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).render('login', { error: 'Ogiltiga inloggningsuppgifter.' });
    }

    req.session.userId = user.id;
    return res.redirect('/backend');
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
