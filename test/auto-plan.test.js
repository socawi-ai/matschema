const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MATSCHEMA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-auto-'));

const store = require('../src/data/store');
const { lockDue, offersArrived, planDue, runAutoPlan } = require('../src/schedule/auto');
const { lockBoughtDays } = require('../src/utils/scheduler');
const { normalizeRules } = require('../src/utils/rules');

// Week of Monday 12 October 2026 (local time).
const at = (day, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute);

test('locking is due from Friday 00:00, once per week, and catches up a missed Friday', () => {
  assert.deepEqual(lockDue(at(16, 0, 0)), { week: '2026-10-12', until: '2026-11-02' }, 'Friday: this week');
  assert.deepEqual(lockDue(at(18, 23)), { week: '2026-10-12', until: '2026-11-02' }, 'Sunday: this week');
  assert.deepEqual(lockDue(at(15, 23, 59)), { week: '2026-10-05', until: '2026-10-26' }, 'Thursday: last week');
  assert.equal(lockDue(at(16, 1), { lockedWeek: '2026-10-12' }), null, 'already locked');
  assert.equal(lockDue(at(13), { lockedWeek: '2026-10-05' }), null, 'last week already locked');
  assert.deepEqual(lockDue(at(13), { lockedWeek: '2026-09-28' }), { week: '2026-10-05', until: '2026-10-26' }, 'missed Friday');
});

test('planning is due Monday–Thursday once the offers are in, or from Tuesday 06:00', () => {
  assert.equal(planDue(at(12, 9), {}, false), false, 'Monday, no offers yet');
  assert.equal(planDue(at(12, 18), {}, true), true, 'Monday, offers in');
  assert.equal(planDue(at(13, 5, 59), {}, false), false, 'Tuesday before the fallback');
  assert.equal(planDue(at(13, 6), {}, false), true, 'Tuesday fallback');
  assert.equal(planDue(at(15, 22), {}, false), true, 'Thursday, catching up');
  assert.equal(planDue(at(16, 9), {}, true), false, 'Friday is too late');
  assert.equal(planDue(at(11, 9), {}, true), false, 'Sunday');
  assert.equal(planDue(at(13, 9), { plannedWeek: '2026-10-12' }, true), false, 'already planned this week');
  assert.equal(planDue(at(13, 9), { plannedWeek: '2026-10-05' }, true), true, 'planned last week');
});

test('offers count as in when every shopping store is fetched this week and has new deals', () => {
  const now = at(12, 18);
  const fetched = (id, iso) => ({ id, enabled: true, last_success_at: iso });
  const stores = [fetched('w', '2026-10-12T08:00:00.000Z'), fetched('i', '2026-10-12T09:00:00.000Z'), fetched('l', '2026-10-01T09:00:00.000Z')];
  const newDeal = { storeId: 'w', firstSeenAt: '2026-10-11T20:00:00.000Z' }; // Sunday evening
  const oldDeal = { storeId: 'i', firstSeenAt: '2026-09-01T10:00:00.000Z', validFrom: null };

  assert.equal(offersArrived(now, stores, [newDeal, oldDeal], ['w', 'i']), true);
  assert.equal(offersArrived(now, stores, [oldDeal], ['w', 'i']), false, 'nothing new');
  assert.equal(offersArrived(now, stores, [newDeal], ['w', 'l']), false, 'a store not fetched this week');
  assert.equal(offersArrived(now, stores, [newDeal], ['i']), false, 'new deals at another store only');
  assert.equal(offersArrived(now, stores, [{ storeId: 'i', validFrom: '2026-10-11T22:00:00.000Z' }], ['i']), true, 'valid from this week');
  assert.equal(offersArrived(now, stores, [newDeal], []), false, 'no shopping stores');
});

test('locking marks filled generated days before the date as bought', () => {
  const weeks = [{
    weekStart: '2026-10-12',
    entries: [
      { date: '2026-10-16', mealId: 'r1', mealName: 'r1', source: 'auto' },
      { date: '2026-10-17', mealId: null, mealName: 'Rester', source: 'auto' },
      { date: '2026-10-18', mealId: 's1', mealName: 's1', source: 'manual' },
      { date: '2026-11-02', mealId: 'r2', mealName: 'r2', source: 'auto' }
    ]
  }];
  const sources = lockBoughtDays(weeks, '2026-11-02')[0].entries.map((e) => e.source);
  assert.deepEqual(sources, ['bought', 'auto', 'manual', 'auto']);
  assert.equal(weeks[0].entries[0].source, 'auto', 'input not changed');
});

test('a week of automatic planning: plan, lock on Friday, then only the new week is planned', async () => {
  const meals = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'].map((id) => [id, ['regular']])
    .concat([['f1', ['fish']], ['f2', ['fish']], ['v1', ['vegetarian']], ['v2', ['vegetarian']]])
    .concat([['s1', ['regular', 'special']], ['s2', ['regular', 'special']], ['s3', ['regular', 'special']]]);
  for (const [name, tags] of meals) await store.addMeal(name, [], tags);

  assert.equal(await runAutoPlan(at(13, 7)), null, 'does nothing while turned off');
  assert.equal((await store.getSchedules()).length, 0);

  await store.saveRules(normalizeRules({ autoPlan: true }));
  const days = async () => (await store.getSchedules()).flatMap((s) => s.entries);

  // Tuesday: no offers fetched in the test, so the fallback plans.
  let state = await runAutoPlan(at(13, 7));
  assert.equal(state.plannedWeek, '2026-10-12');
  assert.equal(state.plannedError, null);
  const planned = await days();
  assert.equal(planned.length, 21);
  assert.ok(planned.every((e) => e.source === 'auto' && e.mealId), 'three weeks generated');

  // The user picks a meal for a day in the week after next.
  const weeks = await store.getSchedules();
  await store.updateScheduleEntry(weeks[2].id, 0, (e) => ({ ...e, mealId: null, mealName: 'Pizza', source: 'manual' }));

  assert.equal((await runAutoPlan(at(13, 9))).plannedAt, state.plannedAt, 'not again the same week');

  // Friday: the shop is done, the deal period is locked.
  state = await runAutoPlan(at(16, 0, 15));
  assert.equal(state.lockedWeek, '2026-10-12');
  assert.equal(state.lockedCount, 20);
  const locked = await days();
  assert.ok(locked.filter((e) => e.mealName !== 'Pizza').every((e) => e.source === 'bought'));

  // Next Tuesday: the bought days stay, only the new week is planned.
  state = await runAutoPlan(at(20, 7));
  assert.equal(state.plannedWeek, '2026-10-19');
  const after = await days();
  const before = new Map(locked.map((e) => [e.date, e]));
  for (const entry of after.filter((e) => e.date < '2026-11-02')) {
    assert.deepEqual(entry, before.get(entry.date), `${entry.date} kept`);
  }
  const newWeek = after.filter((e) => e.date >= '2026-11-02');
  assert.equal(newWeek.length, 7);
  assert.ok(newWeek.every((e) => e.source === 'auto' && e.mealId), 'new week generated');
});
