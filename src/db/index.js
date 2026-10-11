const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const { runMigrations } = require('./migrations');

// MATSCHEMA_DATA_DIR lets tests point the app at a throwaway directory.
const dataDir = process.env.MATSCHEMA_DATA_DIR || path.join(__dirname, '..', '..', 'data');
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

// Opens the database once and brings its schema up to date. Callers share
// the same promise, so nobody gets the connection before setup is finished.
function getDb() {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA foreign_keys = ON');
  await db.exec('PRAGMA busy_timeout = 5000');

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

  // No longer written to (rules are shared now, see the settings table),
  // but kept so migration 1 can read rules saved by older versions.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_rules (
      user_id INTEGER PRIMARY KEY,
      rules_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await runMigrations(db, dataDir);
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

module.exports = {
  countUsers,
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  dataDir,
  getDb,
  updateUserEmail,
  updateUsername,
  updateUserPasswordHash
};
