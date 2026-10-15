const rateLimit = require('express-rate-limit');

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Without a trusted proxy, an X-Forwarded-For header is deliberately
  // ignored (see env.js), so don't log a warning every time one arrives.
  validate: { xForwardedForHeader: false },
  handler: (req, res) => {
    res.status(429).render('login', {
      error: 'För många inloggningsförsök. Vänta 15 minuter och försök igen.'
    });
  }
});

module.exports = loginRateLimiter;
