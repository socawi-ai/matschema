const { loadEnvFile } = require('../src/load-env');

loadEnvFile();

const bcrypt = require('bcryptjs');
const { createUser, findUserByUsername } = require('../src/db');

async function main() {
  const username = (process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!username || !password) {
    console.error('Missing ADMIN_USERNAME (or legacy ADMIN_EMAIL) or ADMIN_PASSWORD environment variables.');
    process.exit(1);
  }

  const existing = await findUserByUsername(username);
  if (existing) {
    console.error(`User already exists: ${username}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUser({ username, passwordHash, role: 'admin' });
  console.log(`Admin user created: ${user.username || user.email} (id=${user.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
