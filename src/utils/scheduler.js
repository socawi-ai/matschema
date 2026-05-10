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

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateRandomWeekSchedule(meals, weekStartDate) {
  if (!meals.length) {
    return null;
  }

  const weekStart = startOfWeek(weekStartDate);
  const shuffled = shuffle(meals);
  const entries = DAYS.map((day, index) => {
    const meal = shuffled[index % shuffled.length];
    return {
      day,
      date: toISODate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index)),
      mealId: meal.id,
      mealName: meal.name
    };
  });

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
  generateRandomWeekSchedule,
  getISOWeekNumber,
  getISOWeekYear,
  startOfISOWeek,
  startOfWeek
};
