const { loadEnvFile } = require('./load-env');

loadEnvFile();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = require('./app');
const { countUsers, createUser } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function generateBootstrapPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

function isAutoBootstrapEnabled() {
  const raw = String(process.env.AUTO_BOOTSTRAP_ADMIN || '').trim().toLowerCase();

  if (raw) {
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  return !isProduction;
}

async function bootstrapDefaultAdminIfNeeded() {
  if (!isAutoBootstrapEnabled()) {
    return;
  }

  const existingUserCount = await countUsers();
  if (existingUserCount > 0) {
    return;
  }

  const username = (process.env.DEFAULT_ADMIN_USERNAME || process.env.DEFAULT_ADMIN_EMAIL || 'admin').trim().toLowerCase();
  const configuredPassword = process.env.DEFAULT_ADMIN_PASSWORD || '';
  const password = configuredPassword || generateBootstrapPassword();

  const passwordHash = await bcrypt.hash(password, 12);
  await createUser({ username, passwordHash, role: 'admin' });

  const shouldPrintPassword = !isProduction;

  console.log('');
  console.log('=== Matschema: första admin skapad automatiskt ===');
  console.log(`Användarnamn: ${username}`);
  if (shouldPrintPassword) {
    console.log(`Lösenord: ${password}`);
  } else {
    console.log('Lösenord: [dolt i produktion]');
  }
  console.log('Ändra lösenordet direkt i backend under användarinställningar.');
  console.log('===============================================');
  console.log('');
}

async function start() {
  await bootstrapDefaultAdminIfNeeded();

  app.listen(PORT, () => {
    console.log(`matschema server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start matschema:', err);
  process.exit(1);
});
