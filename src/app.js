const express = require('express');
const path = require('path');
const session = require('express-session');

const healthRouter = require('./routes/health');
const homeRouter = require('./routes/home');
const frontendRouter = require('./routes/frontend');
const backendRouter = require('./routes/backend');
const authRouter = require('./routes/auth');
const { attachUser, requireAuth } = require('./middleware/auth');
const SQLiteSessionStore = require('./db/session-store');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
const cookieSecure = process.env.COOKIE_SECURE === 'true';
const forceHttps =
  typeof process.env.FORCE_HTTPS === 'string'
    ? process.env.FORCE_HTTPS === 'true'
    : cookieSecure;

const embedAllowedOrigins = String(process.env.EMBED_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && !sessionSecret) {
  throw new Error('SESSION_SECRET must be set in production.');
}

if (isProduction) {
  // Required when running behind a reverse proxy/ingress that terminates TLS.
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use((req, res, next) => {
  // Baseline hardening headers without extra dependencies.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  if (embedAllowedOrigins.length) {
    const frameAncestors = ["'self'", ...embedAllowedOrigins].join(' ');
    res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors}`);
  } else {
    res.setHeader('X-Frame-Options', 'DENY');
  }

  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

if (isProduction && forceHttps) {
  app.use((req, res, next) => {
    const forwardedProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
    const isHttps = req.secure || forwardedProto === 'https';

    if (isHttps) {
      return next();
    }

    const host = req.headers.host || 'localhost';
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(
  session({
    name: 'matschema.sid',
    secret: sessionSecret || 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    store: isProduction ? new SQLiteSessionStore() : undefined,
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
