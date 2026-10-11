const fs = require('fs');
const path = require('path');

const { normalizeMeal } = require('../data/meal');
const { KNOWN_BEFORE_TRACKING, nameKey } = require('../data/deal-name');

// Each migration runs once, in order, inside a transaction. The database's
// PRAGMA user_version records how many have been applied, so restarting the
// app (or upgrading the Docker image again) never repeats one.
const MIGRATIONS = [
  {
    name: 'Flytta måltider, scheman och regler från JSON-filer till SQLite',
    up: migrateJsonToSqlite
  },
  {
    name: 'Lägg till butiker och erbjudanden',
    up: addDeals
  },
  {
    name: 'Lägg till manuella kategorier och nya varor för erbjudanden',
    up: addDealCategoryOverridesAndNames
  },
  {
    name: 'Skilj på dagar du valt själv och genererade dagar i schemat',
    up: addScheduleEntrySource
  }
];

async function runMigrations(db, dataDir) {
  const { user_version: currentVersion } = await db.get('PRAGMA user_version');

  for (let version = currentVersion; version < MIGRATIONS.length; version += 1) {
    const migration = MIGRATIONS[version];
    const afterCommit = [];

    await db.exec('BEGIN IMMEDIATE');
    try {
      await migration.up(db, { dataDir, afterCommit });
      await db.exec(`PRAGMA user_version = ${version + 1}`);
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw new Error(`Databasmigrering ${version + 1} misslyckades (${migration.name}): ${err.message}`, {
        cause: err
      });
    }

    // Cleanup like renaming the old JSON files. The migration is already
    // committed at this point, so a failure here is only worth a warning.
    for (const step of afterCommit) {
      try {
        step();
      } catch (err) {
        console.warn(`Matschema: efterarbete för migrering ${version + 1} misslyckades: ${err.message}`);
      }
    }
  }
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) {
      throw new Error('förväntade en lista');
    }
    return value;
  } catch (err) {
    // Refuse to start rather than come up with an empty meal database.
    throw new Error(`${path.basename(filePath)} kunde inte läsas (${err.message}). Inget har ändrats.`);
  }
}

// Migration 1: meals.json + schedules.json (v0.4 and earlier) and the
// per-user rules become SQLite tables. The JSON files are renamed to
// *.json.migrated afterwards and kept as a backup.
async function migrateJsonToSqlite(db, { dataDir, afterCommit }) {
  await db.exec(`
    CREATE TABLE meals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      ingredients_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE schedules (
      id TEXT PRIMARY KEY,
      week_start TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    -- meal_name is kept even when meal_id is set, so a deleted meal stays
    -- visible on days it was already planned (meal_id becomes NULL).
    CREATE TABLE schedule_entries (
      schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      day_index INTEGER NOT NULL,
      day TEXT NOT NULL,
      date TEXT NOT NULL,
      meal_id TEXT REFERENCES meals(id) ON DELETE SET NULL,
      meal_name TEXT NOT NULL,
      PRIMARY KEY (schedule_id, day_index)
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  const mealsPath = path.join(dataDir, 'meals.json');
  const schedulesPath = path.join(dataDir, 'schedules.json');
  const meals = readJsonFile(mealsPath) || [];
  const schedules = readJsonFile(schedulesPath) || [];

  const mealIds = new Set();
  for (const rawMeal of meals) {
    const meal = normalizeMeal(rawMeal);
    const name = String(meal.name || '').trim();
    if (!meal.id || !name || mealIds.has(String(meal.id))) {
      continue;
    }
    mealIds.add(String(meal.id));
    await db.run(
      'INSERT INTO meals (id, name, tags_json, ingredients_json, created_at) VALUES (?, ?, ?, ?, ?)',
      String(meal.id),
      name,
      JSON.stringify(meal.tags),
      JSON.stringify(meal.ingredients),
      now
    );
  }

  // The old store replaced weeks by weekStart, so for duplicates the last
  // one in the file is the one the app was showing.
  const schedulesByWeek = new Map();
  for (const schedule of schedules) {
    if (schedule && schedule.id && schedule.weekStart && Array.isArray(schedule.entries)) {
      schedulesByWeek.set(schedule.weekStart, schedule);
    }
  }
  for (const schedule of schedulesByWeek.values()) {
    await db.run(
      'INSERT INTO schedules (id, week_start, created_at) VALUES (?, ?, ?)',
      String(schedule.id),
      schedule.weekStart,
      schedule.createdAt || now
    );
    for (const [index, entry] of schedule.entries.entries()) {
      const mealId = entry.mealId && mealIds.has(String(entry.mealId)) ? String(entry.mealId) : null;
      await db.run(
        'INSERT INTO schedule_entries (schedule_id, day_index, day, date, meal_id, meal_name) VALUES (?, ?, ?, ?, ?, ?)',
        String(schedule.id),
        index,
        entry.day || '',
        entry.date || '',
        mealId,
        entry.mealName || 'Rester'
      );
    }
  }

  // Rules used to be stored per user; meals and schedules were always
  // shared, so the most recently saved rules become the shared rules.
  const rulesRow = await db.get('SELECT rules_json FROM user_rules ORDER BY updated_at DESC LIMIT 1');
  if (rulesRow) {
    await db.run(
      "INSERT INTO settings (key, value_json, updated_at) VALUES ('rules', ?, ?)",
      rulesRow.rules_json,
      now
    );
  }

  for (const filePath of [mealsPath, schedulesPath]) {
    if (fs.existsSync(filePath)) {
      afterCommit.push(() => fs.renameSync(filePath, `${filePath}.migrated`));
    }
  }

  const entryCount = [...schedulesByWeek.values()].reduce((sum, s) => sum + s.entries.length, 0);
  afterCommit.push(() => {
    if (meals.length || schedules.length) {
      console.log(
        `Matschema: migrerade ${mealIds.size} måltider och ${schedulesByWeek.size} veckor (${entryCount} dagar) ` +
          'från JSON till SQLite. De gamla filerna finns kvar som *.json.migrated.'
      );
    }
  });
}

// Migration 2: stores to fetch offers from, and the offers themselves.
// Seeded with the stores this household uses in Östersund; each one can be
// switched off in the admin.
async function addDeals(db) {
  await db.exec(`
    CREATE TABLE deal_stores (
      id TEXT PRIMARY KEY,              -- '<chain>:<chain's store id>'
      chain TEXT NOT NULL,              -- willys | ica | coop | lidl
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      deal_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE deals (
      store_id TEXT NOT NULL REFERENCES deal_stores(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      size TEXT,
      deal_text TEXT NOT NULL,
      price REAL,
      regular_price TEXT,
      compare_price TEXT,
      member_only INTEGER NOT NULL DEFAULT 0,
      limit_text TEXT,
      category TEXT,
      valid_from TEXT,
      valid_to TEXT,
      image_url TEXT,
      url TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (store_id, external_id)
    );

    CREATE INDEX deals_valid_to ON deals(valid_to);
  `);

  const stores = [
    ['willys:2120', 'willys', '2120', 'Willys Östersund'],
    ['ica:1003733', 'ica', 'maxi-ica-stormarknad-ostersund-1003733', 'ICA Maxi Östersund'],
    ['ica:1004224', 'ica', 'ica-kvantum-lillange-1004224', 'ICA Kvantum Lillänge'],
    ['coop:231900', 'coop', '231900', 'Stora Coop Östersund'],
    ['lidl:se', 'lidl', 'se', 'Lidl (hela Sverige)']
  ];
  for (const [index, [id, chain, externalId, name]] of stores.entries()) {
    await db.run(
      'INSERT INTO deal_stores (id, chain, external_id, name, sort_order) VALUES (?, ?, ?, ?, ?)',
      id,
      chain,
      externalId,
      name,
      index
    );
  }
}

// Migration 3: manual category corrections per product name, and when each
// product name was first seen (for the "new this week" view). Names already
// in the database count as known, so the first week doesn't show everything
// as new.
async function addDealCategoryOverridesAndNames(db) {
  await db.exec(`
    CREATE TABLE deal_category_overrides (
      name_key TEXT PRIMARY KEY,        -- normalized product name, see nameKey()
      category TEXT NOT NULL,           -- an everyday category id, or 'none'
      updated_at TEXT NOT NULL
    );

    CREATE TABLE deal_names (
      name_key TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL
    );
  `);
  const rows = await db.all('SELECT DISTINCT name FROM deals');
  for (const { name } of rows) {
    await db.run(
      'INSERT OR IGNORE INTO deal_names (name_key, first_seen_at) VALUES (?, ?)',
      nameKey(name),
      KNOWN_BEFORE_TRACKING
    );
  }
}

// Migration 4: whether a day in the schedule was chosen by the user
// ('manual') or filled by the generator ('auto'), so re-planning can replace
// generated days without touching the user's own choices. Days that already
// have a meal count as the user's, so nothing gets replaced by mistake;
// empty days ("Rester" without a meal) are generated.
async function addScheduleEntrySource(db) {
  await db.exec(`
    ALTER TABLE schedule_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
    UPDATE schedule_entries SET source = 'auto' WHERE meal_id IS NULL AND meal_name = 'Rester';
  `);
}

module.exports = { runMigrations, MIGRATIONS };
