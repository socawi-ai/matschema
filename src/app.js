const express = require('express');
const path = require('path');
const session = require('express-session');

const healthRouter = require('./routes/health');
const homeRouter = require('./routes/home');
const frontendRouter = require('./routes/frontend');
const backendRouter = require('./routes/backend');
const authRouter = require('./routes/auth');
const { attachUser, requireAuth } = require('./middleware/auth');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
const cookieSecure = process.env.COOKIE_SECURE === 'true';

if (isProduction && !sessionSecret) {
  throw new Error('SESSION_SECRET must be set in production.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(
  session({
    name: 'matschema.sid',
    secret: sessionSecret || 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use(attachUser);
app.use((req, res, next) => {
  res.locals.currentUser = req.currentUser || null;
  next();
});

app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

app.use('/health', healthRouter);
app.use('/frontend', frontendRouter);
app.use('/auth', authRouter);
app.use('/backend', requireAuth, backendRouter);
app.use('/', homeRouter);

module.exports = app;
