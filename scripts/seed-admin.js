const bcrypt = require('bcryptjs');
const { createUser, findUserByEmail } = require('../src/db');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.error('Missing ADMIN_EMAIL or ADMIN_PASSWORD environment variables.');
    process.exit(1);
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    console.error(`User already exists: ${email}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUser({ email, passwordHash, role: 'admin' });
  console.log(`Admin user created: ${user.email} (id=${user.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
