const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const jsDay = d.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diff);
  return d;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function getISOWeekNumber(dateInput) {
  const date = new Date(dateInput);
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
  const date = new Date(dateInput);
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

function generateWeekSchedule(meals, weekStartDate, rules, existingEntries = []) {
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
      mealName: 'Rester'
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
      used.add(meal.id);
    }
  }
  function pickUnique(pool) {
    const candidates = pool.filter((meal) => !used.has(meal.id));
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : undefined;
  }

  const fishMeals = meals.filter((meal) => (meal.tags || []).includes('fish'));
  const vegetarianMeals = meals.filter((meal) => (meal.tags || []).includes('vegetarian'));
  const specialMeals = meals.filter((meal) => (meal.tags || []).includes('special'));
  const plainMeals = meals.filter(
    (meal) => (meal.tags || []).includes('regular') && !(meal.tags || []).includes('special')
  );

  // Special days (e.g. Friday/Saturday) intentionally share the same dish —
  // that's the one allowed repeat.
  const emptySpecialDays = rules.specialDays.filter((day) => !filledDays.has(day));
  if (emptySpecialDays.length) {
    const specialMeal = pickUnique(specialMeals);
    emptySpecialDays.forEach((day) => assign(day, specialMeal));
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
    assign(day, pickUnique(fishMeals));
    fishDaysAssigned.push(day);
  }

  // Vegetarian days come from the allowed-days list, minus days already used for fish.
  const vegAllowedDays = rules.vegetarianAllowedDays.length
    ? rules.vegetarianAllowedDays
    : ['Måndag', 'Onsdag', 'Torsdag', 'Söndag'];
  const vegDayPool = nonSpecialDays.filter(
    (day) => vegAllowedDays.includes(day) && !fishDaysAssigned.includes(day)
  );
  const vegDaysAssigned = [];
  for (let i = 0; i < rules.vegetarianMealsPerWeek; i += 1) {
    const day = takeRandom(vegDayPool);
    if (!day) break;
    assign(day, pickUnique(vegetarianMeals));
    vegDaysAssigned.push(day);
  }

  // Every remaining day gets a distinct plain dish. If there aren't enough
  // unique dishes left to fill every day, the leftover days stay "Rester"
  // instead of repeating something already used this week.
  const remainingDays = nonSpecialDays.filter(
    (day) => !fishDaysAssigned.includes(day) && !vegDaysAssigned.includes(day)
  );
  remainingDays.forEach((day) => assign(day, pickUnique(plainMeals)));

  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    weekStart: toISODate(weekStart),
    weekNumber: getISOWeekNumber(weekStart),
    createdAt: new Date().toISOString(),
    entries
  };
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
  DAYS,
  generateWeekSchedule,
  getISOWeekNumber,
  getISOWeekYear,
  startOfISOWeek,
  startOfWeek,
  toISODate
};
