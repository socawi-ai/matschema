// How the app is running, read once from the environment (after .env has
// been loaded, see load-env.js).

// Development mode only when asked for. Anything else, including no
// NODE_ENV at all, gets the production safeguards: a required
// SESSION_SECRET, sessions in SQLite, no automatic admin.
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const isProduction = !isDevelopment;

// Reached over HTTPS through a reverse proxy (see the README).
const cookieSecure = process.env.COOKIE_SECURE === 'true';
const forceHttps =
  typeof process.env.FORCE_HTTPS === 'string' && process.env.FORCE_HTTPS !== ''
    ? process.env.FORCE_HTTPS === 'true'
    : cookieSecure;

// Express's "trust proxy": whose X-Forwarded-For / X-Forwarded-Proto to
// believe. They decide the client IP (and so the login rate limit) and
// whether a request came over HTTPS. Anyone can send those headers, so they
// may only be trusted when a proxy in front sets them.
//
// TRUST_PROXY: a number of proxy hops ("1"), "false", or the addresses
// Express accepts ("loopback", "10.0.0.0/8, 172.16.0.0/12", ...). Without
// it, one proxy hop is trusted when the HTTPS settings say there's a proxy,
// and none otherwise.
function trustProxySetting(raw = process.env.TRUST_PROXY, behindHttpsProxy = cookieSecure || forceHttps) {
  const value = String(raw || '').trim();
  if (!value) return behindHttpsProxy ? 1 : false;
  if (/^(false|0|no|off)$/i.test(value)) return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

module.exports = { cookieSecure, forceHttps, isDevelopment, isProduction, trustProxySetting };
