// Fills the planning horizon – used by the admin's buttons and by the
// automatic weekly planning (see auto.js).

const { getDealStores } = require('../data/deals');
const { getMeals, getRules, saveSetting, updateSchedules } = require('../data/store');
const { getDealPlanning } = require('../deals/meal-deals');
const { clearForReplan, generateWeeks, mealCategory, startOfWeek, toISODate } = require('../utils/scheduler');
const { normalizeRules } = require('../utils/rules');

// Short Swedish date: 2026-10-11 -> "11/10".
const shortDate = (date) => `${date.getDate()}/${date.getMonth() + 1}`;

const WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
// Short Swedish weekday and date: "mån 19/10".
const dayText = (date) => `${WEEKDAYS[date.getDay()]} ${shortDate(date)}`;

// The deal period as "16/10–1/11" (its end is exclusive).
const periodLabel = (period) => `${shortDate(period.start)}–${shortDate(new Date(period.end.getTime() - 1))}`;

// Why the rules can't be met with these meals, or null.
function rulesError(meals, rules) {
  if (!meals.length) {
    return 'Lägg till minst en måltid innan du fyller schemat.';
  }
  // Only require the meal types the current rules actually ask for.
  // Special meals only count for special days (see generateWeekSchedule).
  const hasCategory = (category) => meals.some((meal) => mealCategory(meal) === category);
  if (rules.fishMealsPerWeek > 0 && !hasCategory('fish')) {
    return 'Reglerna kräver fisk, men det finns ingen fiskmåltid (utan ⭐) i databasen.';
  }
  if (rules.vegetarianMealsPerWeek > 0 && !hasCategory('vegetarian')) {
    return 'Reglerna kräver vegetariskt, men det finns ingen vegetarisk måltid (utan ⭐) i databasen.';
  }
  if (rules.specialDays.length > 0 && !hasCategory('special')) {
    return 'Det finns specialdagar i reglerna men ingen specialmåltid i databasen.';
  }
  if (rules.specialDays.length < 7 && !meals.some((meal) => mealCategory(meal) !== 'special')) {
    return 'Det krävs minst en vanlig (icke-special) måltid för övriga dagar.';
  }
  return null;
}

// Fills the planning horizon. With `replan`, days in the deal period are
// emptied first so they're planned again with the current deals: only
// generated ('auto') days with scope 'generated', every day with scope 'all'
// (see clearForReplan). Meals whose main ingredient is on offer are picked
// first in the deal period (see generateWeekSchedule), unless that's turned
// off in the rules. `chosenStore` overrides the store chosen in the rules
// ('auto' = the one with deals for the most meals).
//
// The store and period the plan was made for are saved as the setting
// 'dealPlan' ({ storeId, from, to, plannedAt }, or null without deals), for
// the public shopping list (see deals/shopping.js).
//
// Returns { ok: false, error } or { ok: true, message, storeName }.
async function fillSchedule({ replan = false, scope = 'generated', chosenStore, now = new Date() } = {}) {
  const meals = await getMeals();
  const rules = normalizeRules(await getRules());
  const error = rulesError(meals, rules);
  if (error) {
    return { ok: false, error };
  }

  const planning = await getDealPlanning(
    meals,
    { shoppingStores: rules.shoppingStores, chosenStore: chosenStore || rules.shoppingStore },
    now
  );
  const from = toISODate(planning.period.start);
  const to = toISODate(planning.period.end);
  const preference = rules.prioritizeDeals && planning.preferredMealIds.size
    ? { mealIds: planning.preferredMealIds, from, to }
    : null;

  const firstWeekStart = startOfWeek(now);
  const weekStarts = Array.from({ length: rules.planningHorizonWeeks }, (_, i) =>
    new Date(firstWeekStart.getFullYear(), firstWeekStart.getMonth(), firstWeekStart.getDate() + i * 7)
  );

  // Read, plan and save in one transaction, so a day changed meanwhile isn't
  // overwritten (see updateSchedules).
  await updateSchedules((existingSchedules) => {
    // Emptied days don't count as nearby meals for the other weeks either.
    const weeks = existingSchedules.map((schedule) => ({ weekStart: schedule.weekStart, entries: schedule.entries }));
    const knownWeeks = replan ? clearForReplan(weeks, { from, to }, scope) : weeks;
    return generateWeeks(meals, rules, weekStarts, knownWeeks, preference).map((schedule) => {
      const existingSchedule = existingSchedules.find((item) => item.weekStart === schedule.weekStart);
      return existingSchedule ? { ...schedule, id: existingSchedule.id, createdAt: existingSchedule.createdAt } : schedule;
    });
  });

  const periodText = periodLabel(planning.period);
  const store = preference ? (await getDealStores()).find((s) => s.id === planning.storeId) : null;
  await saveSetting('dealPlan', store ? { storeId: store.id, from, to, plannedAt: now.toISOString() } : null);
  const storeText = store ? ` med erbjudanden från ${store.name}` : '';
  const result = (message) => ({ ok: true, message, storeName: store ? store.name : null });
  if (replan && scope === 'all') {
    return result(`Hela perioden ${periodText} är planerad om${storeText}.`);
  }
  if (replan) {
    return result(`Genererade dagar ${periodText} är planerade om${storeText}. Dina egna val och handlade dagar behölls.`);
  }
  return result(preference ? `Tomma dagar har fyllts. Rätter${storeText} prioriterades ${periodText}.` : 'Tomma dagar har fyllts.');
}

module.exports = { dayText, fillSchedule, periodLabel, rulesError, shortDate };
