const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Simulates the data/ volume of an existing v0.4 install: JSON files for
// meals and schedules, and a SQLite file that only has users + user_rules.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-migration-'));
process.env.MATSCHEMA_DATA_DIR = dataDir;

const { runMigrations, MIGRATIONS } = require('../src/db/migrations');

const legacyMeals = [
  { id: 'm1', name: 'Köttbullar', tags: ['regular'], ingredients: ['Färs', 'Lök'] },
  { id: 'm2', name: 'Lax', tags: ['fish', 'special'], ingredients: ['Lax'] },
  // Oldest format: a single `tag` and a `special` flag, no `tags` list.
  { id: 'm3', name: 'Linsgryta', tag: 'vegetarian', special: false, ingredients: ['Linser'] },
  { id: 'm1', name: 'Dubblett med samma id', tags: ['regular'] },
  { id: 'm4', name: '   ' }
];
const days = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const week = (id, weekStart, mealIds) => ({
  id,
  weekStart,
  weekNumber: 41,
  createdAt: '2026-10-01T10:00:00.000Z',
  entries: days.map((day, i) => ({
    day,
    date: `2026-10-${String(5 + i).padStart(2, '0')}`,
    mealId: mealIds[i] || null,
    mealName: mealIds[i] ? `name-${mealIds[i]}` : 'Rester'
  }))
});
const legacySchedules = [
  week('old-dup', '2026-10-05', ['m1']),
  // Same week again: the old store kept the last one, so that one wins.
  week('w41', '2026-10-05', ['m1', 'm2', 'gone', null, 'm3']),
  week('w42', '2026-10-12', ['m3'])
];

async function writeLegacyInstall(dir, { meals = legacyMeals, schedules = legacySchedules } = {}) {
  fs.writeFileSync(path.join(dir, 'meals.json'), typeof meals === 'string' ? meals : JSON.stringify(meals));
  fs.writeFileSync(path.join(dir, 'schedules.json'), JSON.stringify(schedules));
  const db = await open({ filename: path.join(dir, 'matschema.sqlite'), driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, username TEXT UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL);
    CREATE TABLE user_rules (user_id INTEGER PRIMARY KEY, rules_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO users (email, username, password_hash, created_at) VALUES ('a', 'a', 'x', 'now'), ('b', 'b', 'x', 'now');
    INSERT INTO user_rules VALUES (1, '{"fishMealsPerWeek":2}', '2026-01-01'), (2, '{"fishMealsPerWeek":3}', '2026-06-01');
  `);
  return db;
}

test('migrates an existing JSON install into SQLite on first start', async () => {
  const seedDb = await writeLegacyInstall(dataDir);
  await seedDb.close();

  const store = require('../src/data/store');
  const { getDb } = require('../src/db');
  const db = await getDb();

  const meals = await store.getMeals();
  assert.deepEqual(meals.map((m) => m.id), ['m1', 'm2', 'm3'], 'ids kept, duplicates and blank names skipped');
  assert.equal(meals[0].name, 'Köttbullar');
  assert.deepEqual(meals[1].tags, ['fish', 'special']);
  assert.deepEqual(meals[2].tags, ['vegetarian'], 'legacy tag format converted');
  assert.deepEqual(meals[2].ingredients, ['Linser']);

  const schedules = await store.getSchedules();
  assert.deepEqual(schedules.map((s) => s.id), ['w41', 'w42']);
  const w41 = schedules[0].entries;
  assert.equal(w41.length, 7);
  assert.deepEqual([w41[0].mealId, w41[0].mealName], ['m1', 'name-m1']);
  assert.deepEqual([w41[2].mealId, w41[2].mealName], [null, 'name-gone'], 'unknown meal kept as custom name');
  assert.deepEqual([w41[3].mealId, w41[3].mealName], [null, 'Rester']);
  assert.equal(w41[0].source, 'manual', 'existing days with a meal count as chosen by the user');
  assert.equal(w41[3].source, 'auto', 'empty days count as generated');
  assert.equal(w41[6].date, '2026-10-11');

  assert.deepEqual(await store.getRules(), { fishMealsPerWeek: 3 }, 'most recently saved rules become shared');
  assert.equal((await db.get('PRAGMA user_version')).user_version, MIGRATIONS.length);
  assert.deepEqual(
    (await db.all('SELECT session_version FROM users')).map((row) => row.session_version),
    [0, 0],
    'existing logins stay valid: sessions without a version count as 0'
  );

  assert.ok(!fs.existsSync(path.join(dataDir, 'meals.json')));
  assert.ok(fs.existsSync(path.join(dataDir, 'meals.json.migrated')), 'original kept as backup');
  assert.ok(fs.existsSync(path.join(dataDir, 'schedules.json.migrated')));
});

test('a later restart does not import again', async () => {
  const { getDb } = require('../src/db');
  const db = await getDb();
  fs.writeFileSync(path.join(dataDir, 'meals.json'), JSON.stringify([{ id: 'new', name: 'Ska inte importeras' }]));

  await runMigrations(db, dataDir);

  const store = require('../src/data/store');
  assert.equal((await store.getMeals()).length, 3);
  fs.unlinkSync(path.join(dataDir, 'meals.json'));
});

test('store keeps schedules consistent with meal changes', async () => {
  const store = require('../src/data/store');

  await store.updateMeal('m1', { name: 'Mammas köttbullar', ingredients: [], tags: ['regular'] });
  let [w41] = await store.getSchedules();
  assert.equal(w41.entries[0].mealName, 'Mammas köttbullar', 'rename reaches planned days');

  await store.deleteMealById('m1');
  [w41] = await store.getSchedules();
  assert.deepEqual([w41.entries[0].mealId, w41.entries[0].mealName], [null, 'Mammas köttbullar'], 'deleted meal stays as custom');

  const saved = await store.updateScheduleEntry('w41', 3, (entry) => ({ ...entry, mealId: 'm3', mealName: 'Linsgryta' }));
  assert.equal(saved.mealName, 'Linsgryta');
  assert.equal(await store.updateScheduleEntry('w41', 9, (e) => e), null);
  [w41] = await store.getSchedules();
  assert.equal(w41.entries[3].mealId, 'm3');
  assert.equal(w41.entries[4].mealId, 'm3', 'other days untouched');

  await store.removeSchedulesBeforeWeekStart('2026-10-12');
  assert.deepEqual((await store.getSchedules()).map((s) => s.id), ['w42']);
});

test('a corrupt JSON file stops the migration and changes nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-corrupt-'));
  const db = await writeLegacyInstall(dir, { meals: '[{"id": "m1", "name": ' });

  await assert.rejects(runMigrations(db, dir), /meals\.json kunde inte läsas/);

  assert.equal((await db.get('PRAGMA user_version')).user_version, 0);
  assert.equal(await db.get("SELECT name FROM sqlite_master WHERE name = 'meals'"), undefined, 'rolled back');
  assert.ok(fs.existsSync(path.join(dir, 'meals.json')), 'files left in place');
  assert.ok(fs.existsSync(path.join(dir, 'schedules.json')));
  await db.close();
});

test('a fresh install with no JSON files just creates the tables', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-fresh-'));
  const db = await open({ filename: path.join(dir, 'matschema.sqlite'), driver: sqlite3.Database });
  // What db/index.js creates before running the migrations.
  await db.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, username TEXT UNIQUE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL
  )`);
  await db.exec('CREATE TABLE user_rules (user_id INTEGER PRIMARY KEY, rules_json TEXT NOT NULL, updated_at TEXT NOT NULL)');

  await runMigrations(db, dir);

  assert.equal((await db.get('PRAGMA user_version')).user_version, MIGRATIONS.length);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM meals')).n, 0);
  const userColumns = (await db.all('PRAGMA table_info(users)')).map((column) => column.name);
  assert.ok(userColumns.includes('session_version'));
  assert.equal(await db.get("SELECT * FROM settings WHERE key = 'rules'"), undefined);
  await db.close();
});
