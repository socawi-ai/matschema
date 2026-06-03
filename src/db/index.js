const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'matschema.sqlite');

let dbPromise;

async function ensureUsersUsernameColumn(db) {
  const columns = await db.all('PRAGMA table_info(users)');
  const hasUsername = columns.some((column) => column.name === 'username');

  if (!hasUsername) {
    await db.exec('ALTER TABLE users ADD COLUMN username TEXT');
    await db.exec("UPDATE users SET username = LOWER(email) WHERE username IS NULL OR TRIM(username) = ''");
  }

  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username)');
}

async function getDb() {
  if (dbPromise) {
    return dbPromise;
  }

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  dbPromise = open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const db = await dbPromise;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      username TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL
    )
  `);
  await ensureUsersUsernameColumn(db);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_rules (
      user_id INTEGER PRIMARY KEY,
      rules_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  return db;
}

async function findUserByEmail(email) {
  const db = await getDb();
  return db.get('SELECT * FROM users WHERE email = ?', String(email || '').trim().toLowerCase());
}

async function findUserByUsername(username) {
  const db = await getDb();
  return db.get('SELECT * FROM users WHERE username = ?', String(username || '').trim().toLowerCase());
}

async function findUserById(id) {
  const db = await getDb();
  return db.get('SELECT * FROM users WHERE id = ?', id);
}

async function countUsers() {
  const db = await getDb();
  const row = await db.get('SELECT COUNT(*) AS count FROM users');
  return row ? Number(row.count || 0) : 0;
}

async function createUser({ username, email, passwordHash, role = 'admin' }) {
  const db = await getDb();
  const createdAt = new Date().toISOString();
  const normalizedUsername = String(username || email || '').trim().toLowerCase();
  const normalizedEmail = String(email || normalizedUsername || '').trim().toLowerCase();

  const result = await db.run(
    'INSERT INTO users (email, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
    normalizedEmail,
    normalizedUsername,
    passwordHash,
    role,
    createdAt
  );
  return findUserById(result.lastID);
}

async function updateUserEmail(id, email) {
  const db = await getDb();
  const normalized = String(email || '').trim().toLowerCase();
  await db.run('UPDATE users SET email = ?, username = ? WHERE id = ?', normalized, normalized, id);
  return findUserById(id);
}

async function updateUsername(id, username) {
  const db = await getDb();
  const normalized = String(username || '').trim().toLowerCase();
  await db.run('UPDATE users SET username = ?, email = ? WHERE id = ?', normalized, normalized, id);
  return findUserById(id);
}

async function updateUserPasswordHash(id, passwordHash) {
  const db = await getDb();
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', passwordHash, id);
  return findUserById(id);
}

async function getRulesByUserId(userId) {
  const db = await getDb();
  const row = await db.get('SELECT rules_json FROM user_rules WHERE user_id = ?', userId);
  if (!row) return null;
  try {
    return JSON.parse(row.rules_json);
  } catch {
    return null;
  }
}

async function upsertRulesByUserId(userId, rules) {
  const db = await getDb();
  const updatedAt = new Date().toISOString();
  await db.run(
    `
      INSERT INTO user_rules (user_id, rules_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        rules_json = excluded.rules_json,
        updated_at = excluded.updated_at
    `,
    userId,
    JSON.stringify(rules),
    updatedAt
  );
  return getRulesByUserId(userId);
}

module.exports = {
  countUsers,
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  getRulesByUserId,
  getDb,
  upsertRulesByUserId,
  updateUserEmail,
  updateUsername,
  updateUserPasswordHash
};
