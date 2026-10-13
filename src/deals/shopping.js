// The public shopping list: the offers the current plan uses, at the store
// it was made for (the setting 'dealPlan', see schedule/fill.js), with the
// meals and days each offer is for.

const { getCategoryOverrides, getDealStores } = require('../data/deals');
const { getMeals, getSchedules, getSetting } = require('../data/store');
const { dayText, periodLabel } = require('../schedule/fill');
const { parseISODate, startOfWeek, toISODate } = require('../utils/scheduler');
const { EVERYDAY_CATEGORIES } = require('./categories');
const { MAIN_INGREDIENT_CATEGORIES, dealsForMeal, getCurrentMainDeals } = require('./meal-deals');

// An offer's details as short texts: "79,90 kr/st", "jmf 99:88 kr/kg",
// "Medlemspris", "Max 3 köp", "t.o.m. sön 18/10".
function dealInfo(deal) {
  return [
    deal.dealText,
    deal.comparePrice ? `jmf ${deal.comparePrice}` : null,
    deal.memberOnly ? 'Medlemspris' : null,
    deal.limitText,
    deal.validTo ? `t.o.m. ${dayText(new Date(deal.validTo))}` : null
  ].filter(Boolean);
}

// The public view of an offer: product, brand and size, and its details.
const publicDeal = (deal) => ({
  name: deal.name,
  extra: [deal.brand, deal.size].filter(Boolean).join(', '),
  info: dealInfo(deal)
});

// The offers for meals planned in [from, to) ('YYYY-MM-DD', to exclusive),
// among `deals` (one store's), grouped by main-ingredient category:
//   groups   – [{ id, label, emoji, deals: [{ name, extra, info, meals: [{ name, days }] }] }]
//              in MAIN_INGREDIENT_CATEGORIES order; offers by first day used
//   mealDeals – Map of meal id -> its offers, as { name, extra, info }
// `days` are "mån 19/10" texts, in date order.
function buildShoppingList(weeks, meals, deals, { from, to }, overrides = new Map()) {
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
  const datesByMeal = new Map();
  for (const entry of weeks.flatMap((week) => week.entries || [])) {
    if (!entry.mealId || entry.date < from || entry.date >= to || !mealsById.has(entry.mealId)) continue;
    datesByMeal.set(entry.mealId, [...(datesByMeal.get(entry.mealId) || []), entry.date]);
  }

  const mealDeals = new Map();
  const uses = new Map(); // deal -> [{ name, dates }]
  for (const [mealId, dates] of datesByMeal) {
    const meal = mealsById.get(mealId);
    const matched = dealsForMeal(meal, deals, overrides);
    if (!matched.length) continue;
    mealDeals.set(mealId, matched.map(publicDeal));
    for (const deal of matched) {
      uses.set(deal, [...(uses.get(deal) || []), { name: meal.name, dates: [...dates].sort() }]);
    }
  }

  const firstDate = (deal) => uses.get(deal).flatMap((use) => use.dates).sort()[0];
  const groups = MAIN_INGREDIENT_CATEGORIES.map((id) => {
    const category = EVERYDAY_CATEGORIES.find((c) => c.id === id);
    const groupDeals = [...uses.keys()]
      .filter((deal) => deal.everyday === id)
      .sort((a, b) => firstDate(a).localeCompare(firstDate(b)) || a.name.localeCompare(b.name, 'sv'))
      .map((deal) => ({
        ...publicDeal(deal),
        meals: uses.get(deal)
          .sort((a, b) => a.dates[0].localeCompare(b.dates[0]))
          .map((use) => ({ name: use.name, days: use.dates.map((date) => dayText(parseISODate(date))) }))
      }));
    return { id, label: category.label, emoji: category.emoji, deals: groupDeals };
  }).filter((group) => group.deals.length);

  return { groups, mealDeals };
}

// Everything the public pages show about shopping, or null when the plan
// wasn't made with offers or its period is over. Days before today are left
// out.
//   storeName, periodLabel (the whole period), from (today or later), to
//   prominent – the plan is from this week and it's Monday–Thursday, i.e.
//               the shop is still to be done; otherwise shown toned down
//   groups, dealCount, mealDeals – see buildShoppingList
async function getPublicShopping(now = new Date()) {
  const plan = await getSetting('dealPlan');
  if (!plan || !plan.storeId || plan.to <= toISODate(now)) return null;
  const store = (await getDealStores()).find((s) => s.id === plan.storeId);
  if (!store) return null;

  const today = toISODate(now);
  const from = plan.from > today ? plan.from : today;
  const deals = (await getCurrentMainDeals(now)).filter((deal) => deal.storeId === plan.storeId);
  const { groups, mealDeals } = buildShoppingList(
    await getSchedules(),
    await getMeals(),
    deals,
    { from, to: plan.to },
    await getCategoryOverrides()
  );
  const day = now.getDay();
  return {
    storeName: store.name,
    periodLabel: periodLabel({ start: parseISODate(plan.from), end: parseISODate(plan.to) }),
    from,
    to: plan.to,
    prominent: day >= 1 && day <= 4 && Date.parse(plan.plannedAt) >= startOfWeek(now).getTime(),
    groups,
    dealCount: groups.reduce((sum, group) => sum + group.deals.length, 0),
    mealDeals
  };
}

module.exports = { buildShoppingList, dealInfo, getPublicShopping };
