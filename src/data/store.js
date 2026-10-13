const crypto = require('crypto');

const { getDb } = require('../db');
const { inTransaction } = require('../db/transaction');
const { normalizeMeal } = require('./meal');

// A day's source: 'auto' (filled by the generator), 'bought' (generated and
// then locked because the food has been bought, see lockBoughtDays) or
// 'manual' (chosen by the user). Anything else is saved as 'manual'.
const SOURCES = ['auto', 'bought', 'manual'];
const sourceOf = (entry) => (SOURCES.includes(entry.source) ? entry.source : 'manual');

function mealFromRow(row) {
  return normalizeMeal({
    id: row.id,
    name: row.name,
    tags: JSON.parse(row.tags_json),
    ingredients: JSON.parse(row.ingredients_json)
  });
}

// --- Meals ---

async function getMeals() {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM meals ORDER BY rowid');
  return rows.map(mealFromRow);
}

async function addMeal(name, ingredients = [], tags = ['regular']) {
  const meal = normalizeMeal({ id: crypto.randomUUID(), name, ingredients, tags });
  await inTransaction((db) =>
    db.run(
      'INSERT INTO meals (id, name, tags_json, ingredients_json, created_at) VALUES (?, ?, ?, ?, ?)',
      meal.id,
      meal.name,
      JSON.stringify(meal.tags),
      JSON.stringify(meal.ingredients),
      new Date().toISOString()
    )
  );
  return meal;
}

// Replaces a meal's editable fields in one go and carries a new name over
// to the days it's planned on. Returns null if the meal doesn't exist.
async function updateMeal(mealId, { name, ingredients, tags }) {
  const meal = normalizeMeal({ id: mealId, name, ingredients, tags });
  return inTransaction(async (db) => {
    const result = await db.run(
      'UPDATE meals SET name = ?, tags_json = ?, ingredients_json = ? WHERE id = ?',
      meal.name,
      JSON.stringify(meal.tags),
      JSON.stringify(meal.ingredients),
      mealId
    );
    if (!result.changes) {
      return null;
    }
    await db.run('UPDATE schedule_entries SET meal_name = ? WHERE meal_id = ?', meal.name, mealId);
    return meal;
  });
}

// Days where the meal was planned keep its name as a custom meal: the
// foreign key sets meal_id to NULL and meal_name stays.
async function deleteMealById(mealId) {
  await inTransaction((db) => db.run('DELETE FROM meals WHERE id = ?', mealId));
}

// --- Schedules ---

async function getSchedules() {
  return readSchedules(await getDb());
}

async function readSchedules(db) {
  const schedules = await db.all('SELECT * FROM schedules ORDER BY week_start');
  const entries = await db.all('SELECT * FROM schedule_entries ORDER BY schedule_id, day_index');

  const entriesBySchedule = new Map(schedules.map((schedule) => [schedule.id, []]));
  for (const entry of entries) {
    const list = entriesBySchedule.get(entry.schedule_id);
    if (list) {
      list.push({ day: entry.day, date: entry.date, mealId: entry.meal_id, mealName: entry.meal_name, source: entry.source });
    }
  }

  return schedules.map((schedule) => ({
    id: schedule.id,
    weekStart: schedule.week_start,
    createdAt: schedule.created_at,
    entries: entriesBySchedule.get(schedule.id)
  }));
}

// Saves a whole week, replacing any existing week with the same start date.
async function upsertScheduleByWeekStart(schedule) {
  await inTransaction((db) => writeSchedule(db, schedule));
}

// Reads all schedules, lets `plan(schedules)` work out which weeks to save
// (returns an array of schedules), and saves them – all in one transaction.
// Nothing else can write in between, so a day the user changes meanwhile is
// either seen by `plan` or saved afterwards; it's never overwritten with
// what `plan` computed from older data.
async function updateSchedules(plan) {
  return inTransaction(async (db) => {
    const updated = await plan(await readSchedules(db));
    for (const schedule of updated) {
      await writeSchedule(db, schedule);
    }
    return updated;
  });
}

async function writeSchedule(db, schedule) {
  await db.run('DELETE FROM schedules WHERE week_start = ?', schedule.weekStart);
  await db.run(
    'INSERT INTO schedules (id, week_start, created_at) VALUES (?, ?, ?)',
    schedule.id,
    schedule.weekStart,
    schedule.createdAt || new Date().toISOString()
  );
  for (const [index, entry] of schedule.entries.entries()) {
    await db.run(
      'INSERT INTO schedule_entries (schedule_id, day_index, day, date, meal_id, meal_name, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      schedule.id,
      index,
      entry.day,
      entry.date,
      entry.mealId || null,
      entry.mealName,
      sourceOf(entry)
    );
  }
}

async function deleteScheduleById(scheduleId) {
  await inTransaction((db) => db.run('DELETE FROM schedules WHERE id = ?', scheduleId));
}

async function removeSchedulesBeforeWeekStart(weekStartIso) {
  await inTransaction((db) => db.run('DELETE FROM schedules WHERE week_start < ?', weekStartIso));
}

// Updates a single day of one week. `updateEntry(entry, schedule)` returns
// the new entry, or null to cancel. Returns the saved entry or null.
async function updateScheduleEntry(scheduleId, index, updateEntry) {
  return inTransaction(async (db) => {
    const schedule = (await readSchedules(db)).find((item) => item.id === scheduleId);
    if (!schedule || !schedule.entries[index]) {
      return null;
    }
    const entry = updateEntry(schedule.entries[index], schedule);
    if (!entry) {
      return null;
    }
    await db.run(
      'UPDATE schedule_entries SET meal_id = ?, meal_name = ?, source = ? WHERE schedule_id = ? AND day_index = ?',
      entry.mealId || null,
      entry.mealName,
      sourceOf(entry),
      scheduleId,
      index
    );
    return entry;
  });
}

// --- Settings ---

// A JSON value from the settings table, or null if it's missing or broken.
async function getSetting(key) {
  const db = await getDb();
  const row = await db.get('SELECT value_json FROM settings WHERE key = ?', key);
  if (!row) return null;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return null;
  }
}

async function saveSetting(key, value) {
  await inTransaction((db) =>
    db.run(
      `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      key,
      JSON.stringify(value),
      new Date().toISOString()
    )
  );
}

const getRules = () => getSetting('rules');
const saveRules = (rules) => saveSetting('rules', rules);

module.exports = {
  addMeal,
  deleteMealById,
  deleteScheduleById,
  getMeals,
  getRules,
  getSchedules,
  getSetting,
  removeSchedulesBeforeWeekStart,
  saveRules,
  saveSetting,
  updateMeal,
  updateScheduleEntry,
  updateSchedules,
  upsertScheduleByWeekStart
};
