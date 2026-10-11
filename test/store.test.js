const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MATSCHEMA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-store-'));

const store = require('../src/data/store');
const { generateWeeks } = require('../src/utils/scheduler');
const { normalizeRules } = require('../src/utils/rules');
const { secret, text, textList } = require('../src/utils/input');

const meal = (id, ...tags) => ({ id, name: id, tags: tags.length ? tags : ['regular'], ingredients: [] });
const MEALS = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => meal(id))
  .concat(meal('f1', 'fish'), meal('v1', 'vegetarian'), meal('s1', 'regular', 'special'), meal('s2', 'regular', 'special'), meal('s3', 'regular', 'special'));
const WEEKS = [new Date(2026, 9, 5), new Date(2026, 9, 12), new Date(2026, 9, 19)];

test('weeks filled in one go get distinct ids', () => {
  // Ids used to be Date.now() plus a random number below 10000; weeks made
  // in the same millisecond collided about once in 3 300 fills.
  for (let run = 0; run < 2000; run += 1) {
    const ids = generateWeeks(MEALS, normalizeRules({}), WEEKS).map((s) => s.id);
    assert.equal(new Set(ids).size, 3);
  }
});

test('a day changed while the schedule is being filled is not overwritten', async () => {
  for (const meal of MEALS) await store.addMeal(meal.id, [], meal.tags);
  const meals = await store.getMeals();
  const rules = normalizeRules({});
  await store.updateSchedules(() => generateWeeks(meals, rules, WEEKS));
  const week = (await store.getSchedules())[1];

  // Fill again, but make planning slow; meanwhile the user picks a meal.
  let releasePlan;
  const planStarted = new Promise((resolve) => {
    releasePlan = resolve;
  });
  const fill = store.updateSchedules(async (existing) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    releasePlan();
    return generateWeeks(meals, rules, WEEKS, existing.map((w) => ({
      weekStart: w.weekStart,
      entries: w.entries.map((e) => (e.source === 'auto' ? { ...e, mealId: null, mealName: 'Rester' } : e))
    }))).map((s) => ({ ...s, id: existing.find((w) => w.weekStart === s.weekStart).id }));
  });
  const chosen = meals.find((m) => m.name === 'r1');
  const pick = store.updateScheduleEntry(week.id, 2, (entry) => ({ ...entry, mealId: chosen.id, mealName: chosen.name, source: 'manual' }));
  await planStarted;
  await Promise.all([fill, pick]);

  const after = (await store.getSchedules()).find((w) => w.weekStart === week.weekStart);
  assert.equal(after.entries[2].mealId, chosen.id, 'the pick survives the fill');
  assert.equal(after.entries[2].source, 'manual');
});

test('form fields only accept plain text', () => {
  assert.equal(text('  Kyckling  '), 'Kyckling');
  assert.equal(text(['a', 'b']), '');
  assert.equal(text({ x: '1' }), '');
  assert.equal(text(undefined), '');
  assert.equal(secret(' pass word '), ' pass word ', 'passwords are not trimmed');
  assert.equal(secret(['x']), '');
  assert.deepEqual(textList(['a', ' b ', '', { x: 1 }]), ['a', 'b']);
  assert.deepEqual(textList('a'), ['a']);
  assert.deepEqual(textList(undefined), []);
});
