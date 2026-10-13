const crypto = require('crypto');

const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];

function startOfWeek(date = new Date()) {
  const d = parseISODate(date);
  d.setHours(0, 0, 0, 0);
  const jsDay = d.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diff);
  return d;
}

// Formats a date as YYYY-MM-DD in local time. toISOString() would convert
// to UTC first, which shifts local midnight to the previous day east of UTC.
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Parses YYYY-MM-DD as local midnight (new Date('YYYY-MM-DD') would be UTC).
function parseISODate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

function getISOWeekNumber(dateInput) {
  const date = parseISODate(dateInput);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

function getISOWeekYear(dateInput) {
  const date = parseISODate(dateInput);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  return date.getFullYear();
}

function startOfISOWeek(year, weekNumber) {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(year, 0, 4 - jan4Day);
  return new Date(
    week1Monday.getFullYear(),
    week1Monday.getMonth(),
    week1Monday.getDate() + (weekNumber - 1) * 7
  );
}

function takeRandom(pool) {
  if (!pool.length) {
    return undefined;
  }
  const index = Math.floor(Math.random() * pool.length);
  return pool.splice(index, 1)[0];
}

function isEntryFilled(entry) {
  return Boolean(entry) && Boolean(entry.mealId || (entry.mealName && entry.mealName !== 'Rester'));
}

// Fills a week's empty days. Days that already have a meal are kept.
//
// `near` (optional, from mealsUsedNearWeek) lists meals planned in nearby
// weeks; those are avoided when anything else fits, so the same dish – most
// visibly the weekend special – doesn't come back week after week.
//
// `preference` (optional) prioritizes some meals on some days:
//   { mealIds: Set of meal ids, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' (exclusive) }
// On days in that range, a meal is picked among the preferred ones whenever
// one fits the day (fish day, vegetarian day, special day …) and isn't used
// yet this week; otherwise among all meals as usual. Used for meals whose
// main ingredient is on offer.
//
// Generated days get source 'auto'; kept days keep their source, so a later
// re-plan can tell them apart from days the user chose.
// Variety across weeks: a meal used in one week is avoided in weeks within
// this distance (if there's anything else to pick). With 2 for special
// meals, the same weekend dish comes back at the earliest three weeks later.
const VARIETY_WEEKS = { special: 2, regular: 1 };

function weeksBetween(fromIso, toIso) {
  return Math.round((parseISODate(toIso) - parseISODate(fromIso)) / (7 * 24 * 60 * 60 * 1000));
}

// Meal ids planned near the week starting `weekStartIso`, from `weeks`
// ([{ weekStart, entries }]; the week itself is ignored):
// { special: ids within VARIETY_WEEKS.special, regular: ids within VARIETY_WEEKS.regular }.
function mealsUsedNearWeek(weeks, weekStartIso) {
  const near = { special: new Set(), regular: new Set() };
  for (const week of weeks) {
    const distance = Math.abs(weeksBetween(weekStartIso, week.weekStart));
    if (distance === 0) continue;
    for (const entry of week.entries || []) {
      if (!entry.mealId) continue;
      if (distance <= VARIETY_WEEKS.special) near.special.add(entry.mealId);
      if (distance <= VARIETY_WEEKS.regular) near.regular.add(entry.mealId);
    }
  }
  return near;
}

// Whether `meal` was planned near this week (see mealsUsedNearWeek).
function isRecent(meal, near) {
  if (!near) return false;
  return (mealCategory(meal) === 'special' ? near.special : near.regular).has(meal.id);
}

function generateWeekSchedule(meals, weekStartDate, rules, existingEntries = [], preference = null, near = null) {
  if (!meals.length) {
    return null;
  }

  const weekStart = startOfWeek(weekStartDate);
  const existingByDay = new Map((existingEntries || []).map((entry) => [entry.day, entry]));
  const entries = DAYS.map((day, index) => {
    const existing = existingByDay.get(day);
    if (isEntryFilled(existing)) {
      return { ...existing };
    }
    return {
      day,
      date: toISODate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index)),
      mealId: null,
      mealName: 'Rester',
      source: 'auto'
    };
  });
  const entriesByDay = new Map(entries.map((entry) => [entry.day, entry]));
  const filledDays = new Set(entries.filter(isEntryFilled).map((entry) => entry.day));

  const used = new Set(entries.filter((entry) => entry.mealId).map((entry) => entry.mealId));
  function assign(day, meal) {
    if (filledDays.has(day)) return;
    const entry = entriesByDay.get(day);
    if (!entry) return;
    if (meal) {
      entry.mealId = meal.id;
      entry.mealName = meal.name;
      entry.source = 'auto';
      used.add(meal.id);
    }
  }
  function inPreferredRange(day) {
    const date = entriesByDay.get(day).date;
    return Boolean(preference) && date >= preference.from && date < preference.to;
  }
  const randomOf = (list) => (list.length ? list[Math.floor(Math.random() * list.length)] : undefined);
  // A meal from `pool` not used yet this week, picked from the first
  // non-empty group of:
  //   1. preferred (on offer) and not planned in nearby weeks
  //   2. not planned in nearby weeks
  //   3. preferred
  //   4. any
  // so variety comes before deals, and deals are used as far as variety
  // allows. Preference only applies when `days` are in its range.
  function pickUnique(pool, days = []) {
    const candidates = pool.filter((meal) => !used.has(meal.id));
    const preferredHere = days.some(inPreferredRange);
    const isPreferred = (meal) => preferredHere && preference.mealIds.has(meal.id);
    const fresh = (meal) => !isRecent(meal, near);
    for (const keep of [(m) => isPreferred(m) && fresh(m), fresh, isPreferred, () => true]) {
      const group = candidates.filter(keep);
      if (group.length) return randomOf(group);
    }
    return undefined;
  }

  // Special meals are reserved for special days, so they're kept out of the
  // fish/vegetarian/plain pools used for the rest of the week.
  const specialMeals = meals.filter((meal) => mealCategory(meal) === 'special');
  const fishMeals = meals.filter((meal) => mealCategory(meal) === 'fish');
  const vegetarianMeals = meals.filter((meal) => mealCategory(meal) === 'vegetarian');
  const plainMeals = meals.filter((meal) => mealCategory(meal) === 'regular');

  // Special days (e.g. Friday/Saturday) intentionally share the same dish —
  // that's the one allowed repeat.
  // Otherwise each special day gets its own dish.
  const emptySpecialDays = rules.specialDays.filter((day) => !filledDays.has(day));
  if (rules.sameSpecialAcrossSpecialDays) {
    const specialMeal = pickUnique(specialMeals, emptySpecialDays);
    emptySpecialDays.forEach((day) => assign(day, specialMeal));
  } else {
    emptySpecialDays.forEach((day) => assign(day, pickUnique(specialMeals, [day])));
  }

  const nonSpecialDays = DAYS.filter((day) => !rules.specialDays.includes(day) && !filledDays.has(day));

  // First fish day prefers Monday-Thursday; extra fish days can land on any
  // remaining non-special day. Each fish day gets a distinct dish.
  const fishDayPool = [...nonSpecialDays];
  const preferredFishDayPool = fishDayPool.filter((day) =>
    ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag'].includes(day)
  );
  const fishDaysAssigned = [];
  for (let i = 0; i < rules.fishMealsPerWeek; i += 1) {
    const day = i === 0 && preferredFishDayPool.length ? takeRandom(preferredFishDayPool) : takeRandom(fishDayPool);
    if (!day) break;
    const otherIdx = fishDayPool.indexOf(day);
    if (otherIdx >= 0) fishDayPool.splice(otherIdx, 1);
    const preferredIdx = preferredFishDayPool.indexOf(day);
    if (preferredIdx >= 0) preferredFishDayPool.splice(preferredIdx, 1);
    assign(day, pickUnique(fishMeals, [day]));
    fishDaysAssigned.push(day);
  }

  // Vegetarian days come from the allowed-days list, minus days already used for fish.
  const vegDayPool = nonSpecialDays.filter(
    (day) => rules.vegetarianAllowedDays.includes(day) && !fishDaysAssigned.includes(day)
  );
  const vegDaysAssigned = [];
  for (let i = 0; i < rules.vegetarianMealsPerWeek; i += 1) {
    const day = takeRandom(vegDayPool);
    if (!day) break;
    assign(day, pickUnique(vegetarianMeals, [day]));
    vegDaysAssigned.push(day);
  }

  // Every remaining day gets a distinct plain dish. If there aren't enough
  // unique dishes left to fill every day, the leftover days stay "Rester"
  // instead of repeating something already used this week. Days in the
  // preferred range go first, so earlier days don't use up the preferred
  // meals (no repeats within a week).
  const remainingDays = nonSpecialDays
    .filter((day) => !fishDaysAssigned.includes(day) && !vegDaysAssigned.includes(day))
    .sort((a, b) => Number(inPreferredRange(b)) - Number(inPreferredRange(a)));
  remainingDays.forEach((day) => assign(day, pickUnique(plainMeals, [day])));

  return {
    // Several weeks are created within the same millisecond, so the id must
    // not depend on time (Date.now() plus a small random number collided).
    id: crypto.randomUUID(),
    weekStart: toISODate(weekStart),
    weekNumber: getISOWeekNumber(weekStart),
    createdAt: new Date().toISOString(),
    entries
  };
}

// Fills several weeks in order, each seeing the others, so variety holds
// across weeks: days already planned (and weeks filled earlier in this run)
// count as nearby meals for the next.
//   weekStarts – Dates of the weeks to fill
//   knownWeeks – all planned weeks [{ weekStart, entries }] (any order),
//                including those being filled, with their current entries
// Returns the filled schedules, one per weekStart.
function generateWeeks(meals, rules, weekStarts, knownWeeks = [], preference = null) {
  const weeks = knownWeeks.map((week) => ({ weekStart: week.weekStart, entries: week.entries || [] }));
  const schedules = [];
  for (const weekStart of weekStarts) {
    const weekStartIso = toISODate(startOfWeek(weekStart));
    let week = weeks.find((w) => w.weekStart === weekStartIso);
    if (!week) {
      week = { weekStart: weekStartIso, entries: [] };
      weeks.push(week);
    }
    const schedule = generateWeekSchedule(meals, weekStart, rules, week.entries, preference, mealsUsedNearWeek(weeks, weekStartIso));
    if (schedule) {
      week.entries = schedule.entries;
      schedules.push(schedule);
    }
  }
  return schedules;
}

// Empties days in [from, to) ('YYYY-MM-DD', to exclusive) so they're
// planned again: with scope 'generated' only days the generator filled
// (source 'auto'), with scope 'all' every day in the range, including the
// user's own choices. Emptied days count as generated. Returns new week
// objects; the input is not changed.
function clearForReplan(weeks, { from, to }, scope = 'generated') {
  return weeks.map((week) => ({
    ...week,
    entries: (week.entries || []).map((entry) =>
      entry.date >= from && entry.date < to && (scope === 'all' || entry.source === 'auto')
        ? { ...entry, mealId: null, mealName: 'Rester', source: 'auto' }
        : entry
    )
  }));
}

function mealCategory(meal) {
  const tags = (meal && meal.tags) || [];
  if (tags.includes('special')) return 'special';
  if (tags.includes('fish')) return 'fish';
  if (tags.includes('vegetarian')) return 'vegetarian';
  return 'regular';
}

// Picks a replacement meal for one day (the 🎲 button). Special days draw
// from special meals; other days keep the current meal's category (fish stays
// fish, vegetarian stays vegetarian) and fall back to any non-special meal.
// Never returns a meal already used elsewhere that week, or the current one.
// `near` (optional, from mealsUsedNearWeek): meals planned in nearby weeks,
// avoided when anything else fits.
function pickRandomMealForDay(meals, rules, entries, index, near = null) {
  const entry = entries[index];
  if (!entry) return undefined;

  const usedElsewhere = new Set(
    entries.filter((other, i) => i !== index && other.mealId).map((other) => other.mealId)
  );
  const isAvailable = (meal) => meal.id !== entry.mealId && !usedElsewhere.has(meal.id);
  const pickFrom = (pool) => {
    const candidates = pool.filter(isAvailable);
    const fresh = candidates.filter((meal) => !isRecent(meal, near));
    const choices = fresh.length ? fresh : candidates;
    return choices.length ? choices[Math.floor(Math.random() * choices.length)] : undefined;
  };

  if (rules.specialDays.includes(entry.day)) {
    return pickFrom(meals.filter((meal) => mealCategory(meal) === 'special'));
  }

  const nonSpecial = meals.filter((meal) => mealCategory(meal) !== 'special');
  const current = meals.find((meal) => meal.id === entry.mealId);
  const category = current ? mealCategory(current) : 'regular';
  if (category === 'fish' || category === 'vegetarian') {
    const sameCategory = pickFrom(nonSpecial.filter((meal) => mealCategory(meal) === category));
    if (sameCategory) return sameCategory;
  }
  return pickFrom(nonSpecial);
}

function buildThreeWeekView(schedules, baseDate = new Date()) {
  const week0 = startOfWeek(baseDate);
  const weeks = [];

  for (let i = 0; i < 3; i += 1) {
    const start = new Date(week0.getFullYear(), week0.getMonth(), week0.getDate() + i * 7);
    const startISO = toISODate(start);
    const scheduled = schedules.find((s) => s.weekStart === startISO);
    weeks.push({
      weekStart: startISO,
      weekNumber: getISOWeekNumber(start),
      entries: scheduled ? scheduled.entries : DAYS.map((day, index) => ({
        day,
        date: toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)),
        mealName: 'Ej schemalagd ännu'
      }))
    });
  }

  return weeks;
}

module.exports = {
  buildThreeWeekView,
  clearForReplan,
  DAYS,
  generateWeekSchedule,
  generateWeeks,
  getISOWeekNumber,
  mealCategory,
  mealsUsedNearWeek,
  parseISODate,
  pickRandomMealForDay,
  getISOWeekYear,
  startOfISOWeek,
  startOfWeek,
  toISODate
};
