const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DAYS,
  generateWeekSchedule,
  generateWeeks,
  mealsUsedNearWeek,
  getISOWeekNumber,
  pickRandomMealForDay,
  startOfWeek,
  toISODate
} = require('../src/utils/scheduler');
const { normalizeRules } = require('../src/utils/rules');

function meal(id, ...tags) {
  return { id, name: `Meal ${id}`, tags: tags.length ? tags : ['regular'], ingredients: [] };
}

const MEALS = [
  meal('r1'), meal('r2'), meal('r3'), meal('r4'), meal('r5'),
  meal('f1', 'fish'), meal('f2', 'fish'),
  meal('v1', 'vegetarian'), meal('v2', 'vegetarian'),
  meal('s1', 'regular', 'special'), meal('s2', 'regular', 'special'),
  meal('sv', 'vegetarian', 'special'), meal('sf', 'fish', 'special')
];
const byId = new Map(MEALS.map((m) => [m.id, m]));
const MONDAY = new Date(2026, 9, 5); // 2026-10-05, a Monday

function categoryOf(entry) {
  const m = byId.get(entry.mealId);
  if (!m) return 'none';
  if (m.tags.includes('special')) return 'special';
  if (m.tags.includes('fish')) return 'fish';
  if (m.tags.includes('vegetarian')) return 'vegetarian';
  return 'regular';
}

test('toISODate and startOfWeek use local dates', () => {
  assert.equal(toISODate(new Date(2026, 9, 5)), '2026-10-05');
  assert.equal(toISODate(startOfWeek(new Date(2026, 9, 11, 23, 30))), '2026-10-05');
  assert.equal(toISODate(startOfWeek('2026-10-05')), '2026-10-05');
  assert.equal(getISOWeekNumber('2026-10-05'), 41);
});

test('normalizeRules keeps 0 and clamps out-of-range values', () => {
  const rules = normalizeRules({ fishMealsPerWeek: '0', vegetarianMealsPerWeek: 0, planningHorizonWeeks: 99 });
  assert.equal(rules.fishMealsPerWeek, 0);
  assert.equal(rules.vegetarianMealsPerWeek, 0);
  assert.equal(rules.planningHorizonWeeks, 12);
  assert.equal(normalizeRules({ fishMealsPerWeek: 'abc' }).fishMealsPerWeek, 1);
});

test('generated week follows the default rules without repeats', () => {
  const rules = normalizeRules({});
  for (let run = 0; run < 50; run += 1) {
    const { entries, weekStart } = generateWeekSchedule(MEALS, MONDAY, rules);
    assert.equal(weekStart, '2026-10-05');
    assert.deepEqual(entries.map((e) => e.day), DAYS);
    assert.equal(entries[0].date, '2026-10-05');

    const fri = entries.find((e) => e.day === 'Fredag');
    const sat = entries.find((e) => e.day === 'Lördag');
    assert.equal(categoryOf(fri), 'special');
    assert.equal(fri.mealId, sat.mealId);

    const others = entries.filter((e) => !rules.specialDays.includes(e.day));
    assert.ok(others.every((e) => categoryOf(e) !== 'special'), 'special meals only on special days');
    assert.equal(others.filter((e) => categoryOf(e) === 'fish').length, 1);
    const veg = others.filter((e) => categoryOf(e) === 'vegetarian');
    assert.equal(veg.length, 1);
    assert.ok(rules.vegetarianAllowedDays.includes(veg[0].day));

    const ids = others.map((e) => e.mealId);
    assert.equal(new Set(ids).size, ids.length, 'no repeated dish on non-special days');
  }
});

test('0 fish / 0 vegetarian / no vegetarian days are respected', () => {
  const rules = normalizeRules({ fishMealsPerWeek: 0, vegetarianMealsPerWeek: 2, vegetarianAllowedDays: [] });
  for (let run = 0; run < 20; run += 1) {
    const { entries } = generateWeekSchedule(MEALS, MONDAY, rules);
    assert.ok(entries.every((e) => categoryOf(e) !== 'fish'));
    assert.ok(entries.every((e) => categoryOf(e) !== 'vegetarian'));
  }
});

test('special days get different dishes when sharing is turned off', () => {
  const rules = normalizeRules({ sameSpecialAcrossSpecialDays: false });
  const { entries } = generateWeekSchedule(MEALS, MONDAY, rules);
  const fri = entries.find((e) => e.day === 'Fredag');
  const sat = entries.find((e) => e.day === 'Lördag');
  assert.equal(categoryOf(fri), 'special');
  assert.equal(categoryOf(sat), 'special');
  assert.notEqual(fri.mealId, sat.mealId);
});

test('existing picks are kept and "Rester" days get filled', () => {
  const rules = normalizeRules({});
  const existing = DAYS.map((day) => ({ day, mealId: null, mealName: 'Rester' }));
  existing[1] = { day: 'Tisdag', mealId: 'r1', mealName: 'Meal r1' };
  existing[2] = { day: 'Onsdag', mealId: null, mealName: 'Rester/Matlåda' };
  const { entries } = generateWeekSchedule(MEALS, MONDAY, rules, existing);
  assert.equal(entries[1].mealId, 'r1');
  assert.equal(entries[2].mealName, 'Rester/Matlåda');
  assert.ok(entries[0].mealId, 'Rester day was filled');
});

test('not enough meals leaves "Rester" instead of repeating', () => {
  const few = [meal('r1'), meal('f1', 'fish'), meal('s1', 'regular', 'special')];
  const rules = normalizeRules({ vegetarianMealsPerWeek: 0 });
  const { entries } = generateWeekSchedule(few, MONDAY, rules);
  const planned = entries.filter((e) => e.mealId && !rules.specialDays.includes(e.day));
  assert.equal(planned.length, 2);
  assert.equal(entries.filter((e) => e.mealName === 'Rester').length, 3);
});

test('random pick respects day type and avoids repeats', () => {
  const rules = normalizeRules({});
  const entries = DAYS.map((day) => ({ day, mealId: null, mealName: 'Rester' }));
  entries[0] = { day: 'Måndag', mealId: 'f1', mealName: 'Meal f1' };
  entries[1] = { day: 'Tisdag', mealId: 'r1', mealName: 'Meal r1' };
  entries[4] = { day: 'Fredag', mealId: 's1', mealName: 'Meal s1' };

  for (let run = 0; run < 30; run += 1) {
    assert.equal(pickRandomMealForDay(MEALS, rules, entries, 0).id, 'f2', 'fish day stays fish');
    const special = pickRandomMealForDay(MEALS, rules, entries, 4);
    assert.ok(special.tags.includes('special') && special.id !== 's1', 'special day gets another special');
    const plain = pickRandomMealForDay(MEALS, rules, entries, 2);
    assert.ok(!plain.tags.includes('special'));
    assert.ok(!['f1', 'r1'].includes(plain.id), 'not used elsewhere this week');
  }

  const onlyOneSpecial = MEALS.filter((m) => !m.tags.includes('special') || m.id === 's1');
  assert.equal(pickRandomMealForDay(onlyOneSpecial, rules, entries, 4), undefined);
});

test('preferred (deal) meals are picked first on days in the preferred range', () => {
  // Vegetarian day fixed to Monday, so Sunday is always a plain day here.
  const rules = normalizeRules({ vegetarianAllowedDays: ['Måndag'] });
  // Week 41: Friday 9/10 – Sunday 11/10 in range, like deals bought before Friday.
  const fridayToSunday = (ids) => ({ mealIds: new Set(ids), from: '2026-10-09', to: '2026-10-12' });
  const entry = (entries, day) => entries.find((e) => e.day === day);

  for (let run = 0; run < 40; run += 1) {
    // Sunday is the only plain day in range: always the preferred plain meal.
    let { entries } = generateWeekSchedule(MEALS, MONDAY, rules, [], fridayToSunday(['r1']));
    assert.equal(entry(entries, 'Söndag').mealId, 'r1');
    assert.ok(entries.filter((e) => e.mealId === 'r1').length === 1, 'not used earlier in the week');

    // Friday/Saturday (special days) get the preferred special meal.
    ({ entries } = generateWeekSchedule(MEALS, MONDAY, rules, [], fridayToSunday(['s2'])));
    assert.equal(entry(entries, 'Fredag').mealId, 's2');
    assert.equal(entry(entries, 'Lördag').mealId, 's2');

    // The fish day gets the preferred fish meal when the whole week is in range.
    ({ entries } = generateWeekSchedule(MEALS, MONDAY, rules, [], { mealIds: new Set(['f2']), from: '2026-10-05', to: '2026-10-12' }));
    assert.ok(entries.some((e) => e.mealId === 'f2'), 'fish day uses the preferred fish meal');
    assert.ok(!entries.some((e) => e.mealId === 'f1'));
  }
});

test('preference does nothing outside its range, and falls back when the meal is used', () => {
  const rules = normalizeRules({});
  const sundays = new Set();
  for (let run = 0; run < 40; run += 1) {
    const { entries } = generateWeekSchedule(MEALS, MONDAY, rules, [], { mealIds: new Set(['r1']), from: '2026-10-12', to: '2026-10-19' });
    sundays.add(entries.find((e) => e.day === 'Söndag').mealId);
  }
  assert.ok(sundays.size > 1, 'next week’s preference does not steer this week');

  // r1 is already on Monday (chosen by the user): no repeat on Sunday.
  const existing = [{ day: 'Måndag', date: '2026-10-05', mealId: 'r1', mealName: 'Meal r1', source: 'manual' }];
  const { entries } = generateWeekSchedule(MEALS, MONDAY, rules, existing, { mealIds: new Set(['r1']), from: '2026-10-09', to: '2026-10-12' });
  assert.notEqual(entries.find((e) => e.day === 'Söndag').mealId, 'r1');
  assert.ok(entries.find((e) => e.day === 'Söndag').mealId, 'still filled with something');
  assert.equal(entries[0].source, 'manual', 'kept days keep their source');
  assert.ok(entries.slice(1).every((e) => e.source === 'auto'), 'generated days are marked auto');
});

// Three weeks from Monday 5/10 2026, filled in one go like "Fyll tomma dagar".
const THREE_WEEKS = [new Date(2026, 9, 5), new Date(2026, 9, 12), new Date(2026, 9, 19)];
const weekendMeal = (schedule) => schedule.entries.find((e) => e.day === 'Fredag').mealId;

test('nearby weeks: special meals within two weeks, others within one', () => {
  const weeks = [
    { weekStart: '2026-10-05', entries: [{ mealId: 'a' }] },
    { weekStart: '2026-10-12', entries: [{ mealId: 'b' }] },
    { weekStart: '2026-10-19', entries: [{ mealId: 'c' }] },
    { weekStart: '2026-10-26', entries: [{ mealId: 'd' }] }
  ];
  const near = mealsUsedNearWeek(weeks, '2026-10-19');
  assert.deepEqual([...near.special].sort(), ['a', 'b', 'd']);
  assert.deepEqual([...near.regular].sort(), ['b', 'd']);
});

test('the weekend special varies across weeks', () => {
  const rules = normalizeRules({});
  for (let run = 0; run < 100; run += 1) {
    const specials = generateWeeks(MEALS, rules, THREE_WEEKS).map(weekendMeal);
    assert.equal(new Set(specials).size, 3, `same special twice: ${specials}`);
  }
});

test('deal specials are used, but not on every weekend', () => {
  const rules = normalizeRules({});
  const preference = { mealIds: new Set(['s1', 's2']), from: '2026-10-05', to: '2026-10-26' };
  for (let run = 0; run < 100; run += 1) {
    const specials = generateWeeks(MEALS, rules, THREE_WEEKS, [], preference).map(weekendMeal);
    assert.equal(new Set(specials).size, 3, `same special twice: ${specials}`);
    assert.deepEqual(specials.slice(0, 2).sort(), ['s1', 's2'], 'both deal specials come first');
  }
});

test('a special chosen by hand counts too', () => {
  const rules = normalizeRules({});
  const chosen = [
    { day: 'Fredag', date: '2026-10-09', mealId: 's1', mealName: 'Meal s1', source: 'manual' },
    { day: 'Lördag', date: '2026-10-10', mealId: 's1', mealName: 'Meal s1', source: 'manual' }
  ];
  for (let run = 0; run < 50; run += 1) {
    const schedules = generateWeeks(MEALS, rules, THREE_WEEKS, [{ weekStart: '2026-10-05', entries: chosen }]);
    assert.equal(weekendMeal(schedules[0]), 's1', 'kept');
    assert.ok(!schedules.slice(1).some((schedule) => weekendMeal(schedule) === 's1'));
  }
});

test('ordinary meals avoid the week before and after when there are alternatives', () => {
  const rules = normalizeRules({ vegetarianMealsPerWeek: 0, fishMealsPerWeek: 0 });
  const plain = (schedule) => schedule.entries.filter((e) => /^r/.test(e.mealId || '')).map((e) => e.mealId);
  // 5 plain days a week. With 10 plain meals two weeks need not share any;
  // by chance alone that would happen about 1 time in 252.
  const tenPlain = MEALS.concat(['r6', 'r7', 'r8', 'r9', 'r10'].map((id) => meal(id)));
  for (let run = 0; run < 50; run += 1) {
    const [first, second] = generateWeeks(tenPlain, rules, THREE_WEEKS.slice(0, 2));
    assert.deepEqual(plain(second).filter((id) => plain(first).includes(id)), []);
  }
  // With only 6, the overlap is the unavoidable minimum: 5 + 5 - 6 = 4.
  const sixPlain = MEALS.concat(meal('r6'));
  for (let run = 0; run < 50; run += 1) {
    const [first, second] = generateWeeks(sixPlain, rules, THREE_WEEKS.slice(0, 2));
    assert.equal(plain(second).filter((id) => plain(first).includes(id)).length, 4);
  }
});

test('with a single special meal, it is still used every weekend', () => {
  const rules = normalizeRules({});
  const oneSpecial = MEALS.filter((m) => !m.tags.includes('special') || m.id === 's1');
  const specials = generateWeeks(oneSpecial, rules, THREE_WEEKS).map(weekendMeal);
  assert.deepEqual(specials, ['s1', 's1', 's1']);
});

test('🎲 avoids meals planned in nearby weeks', () => {
  const rules = normalizeRules({});
  const entries = DAYS.map((day) => ({ day, mealId: null, mealName: 'Rester' }));
  entries[4] = { day: 'Fredag', mealId: 's1', mealName: 'Meal s1' };
  const near = { special: new Set(['s2', 'sv']), regular: new Set() };
  for (let run = 0; run < 30; run += 1) {
    assert.equal(pickRandomMealForDay(MEALS, rules, entries, 4, near).id, 'sf', 'the only special not used nearby');
  }
});
