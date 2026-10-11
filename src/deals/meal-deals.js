// Connects meals to deals, so the schedule generator can prioritize meals
// whose main ingredient is on offer at the store you'll shop at.
//
// Only protein categories count as main ingredients: milk, vegetables and
// pasta are on offer every week, so they'd make every meal a deal meal.
// For the same reason a matching *category* isn't enough – even a single
// store has some meat, chicken and fish on offer every week – so a deal must
// be for the ingredient itself (see dealMatchesIngredient).

const { getCategoryOverrides } = require('../data/deals');
const { nameKey } = require('../data/deal-name');
const { classifyDeal } = require('./categories');
const { getDealsForDisplay } = require('./display');
const { startOfWeek } = require('../utils/scheduler');

const MAIN_INGREDIENT_CATEGORIES = ['kott', 'kottfars', 'kyckling', 'korv', 'fisk', 'vego'];

// The everyday category of one ingredient: a manual correction for that
// name if there is one ('none' = no category), otherwise the rules.
function ingredientCategory(ingredient, overrides = new Map()) {
  const override = overrides.get(nameKey(ingredient));
  if (override) return override === 'none' ? null : override;
  return classifyDeal({ name: ingredient });
}

// The meal's main-ingredient categories, e.g. ['kyckling']. Beans and
// lentils only count when there's no meat, chicken or fish: in chili con
// carne the mince is what matters.
function mainIngredientCategories(meal, overrides = new Map()) {
  const categories = new Set(
    (meal.ingredients || [])
      .map((ingredient) => ingredientCategory(ingredient, overrides))
      .filter((category) => MAIN_INGREDIENT_CATEGORIES.includes(category))
  );
  if (categories.size > 1) categories.delete('vego');
  return [...categories];
}

// Whether a deal is for this ingredient: same category, and either the
// product name contains the ingredient ("Kyckling" in "Kycklingbröstfilé",
// "Lax" in "Laxfilé 4-pack") or the ingredient ends with a word from the
// product name ("Röda linser" and "linser", "Kidneybönor" and "bönor").
// Not the other way round: "Kycklingklubbor" doesn't match "Fryst kryddad
// kyckling".
function dealMatchesIngredient(deal, ingredient, category) {
  if (deal.everyday !== category) return false;
  const product = String(deal.name || '').toLowerCase();
  const wanted = String(ingredient || '').toLowerCase().trim();
  if (!wanted) return false;
  if (product.includes(wanted)) return true;
  const ingredientWords = wanted.split(/[^\p{L}]+/u).filter(Boolean);
  return product
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 4)
    .some((word) => ingredientWords.some((ingredientWord) => ingredientWord.endsWith(word)));
}

// The deals (among `deals`) for a meal's main ingredients.
function dealsForMeal(meal, deals, overrides = new Map()) {
  const main = new Set(mainIngredientCategories(meal, overrides));
  const matched = [];
  for (const ingredient of meal.ingredients || []) {
    const category = ingredientCategory(ingredient, overrides);
    if (!main.has(category)) continue;
    for (const deal of deals) {
      if (!matched.includes(deal) && dealMatchesIngredient(deal, ingredient, category)) matched.push(deal);
    }
  }
  return matched;
}

// Picks the store to shop at: the one (among `storeIds`) with deals for the
// most meals. Returns [{ storeId, mealCount }] best first; ties keep the
// given store order.
function rankStores(meals, deals, storeIds, overrides = new Map()) {
  return storeIds
    .map((storeId, order) => {
      const storeDeals = deals.filter((deal) => deal.storeId === storeId);
      const mealCount = meals.filter((meal) => dealsForMeal(meal, storeDeals, overrides).length).length;
      return { storeId, mealCount, order };
    })
    .sort((a, b) => b.mealCount - a.mealCount || a.order - b.order)
    .map(({ storeId, mealCount }) => ({ storeId, mealCount }));
}

// The days deals are bought for: shopping happens before Friday, so from
// Friday this week (or today, if later) through Sunday two weeks ahead.
// Returns { start, end } as local dates, end exclusive.
function dealPeriod(now = new Date()) {
  const monday = startOfWeek(now);
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    start: today > friday ? today : friday,
    end: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 21)
  };
}

// Main-ingredient deals valid right now (in the deals tab's order).
async function getCurrentMainDeals(now = new Date()) {
  return (await getDealsForDisplay(now)).filter(
    (deal) =>
      MAIN_INGREDIENT_CATEGORIES.includes(deal.everyday) &&
      (!deal.validFrom || Date.parse(deal.validFrom) <= now.getTime()) &&
      (!deal.validTo || Date.parse(deal.validTo) >= now.getTime())
  );
}

// Everything the schedule needs about deals right now:
//   period          – the days deals are bought for
//   storeRanking    – the shopping stores, most meals with deals first
//   storeId         – the store to shop at: `chosenStore`, or the best one
//   dealsByMealId   – Map of meal id -> its deals at that store
//   preferredMealIds – meals to pick first (those with deals)
//   mainByMealId    – each meal's main-ingredient categories
async function getDealPlanning(meals, { shoppingStores = [], chosenStore = 'auto' } = {}, now = new Date()) {
  const overrides = await getCategoryOverrides();
  const deals = (await getCurrentMainDeals(now)).filter((deal) => shoppingStores.includes(deal.storeId));
  const storeRanking = rankStores(meals, deals, shoppingStores, overrides);
  const storeId = shoppingStores.includes(chosenStore)
    ? chosenStore
    : storeRanking.length && storeRanking[0].mealCount > 0 ? storeRanking[0].storeId : null;

  const storeDeals = deals.filter((deal) => deal.storeId === storeId);
  const dealsByMealId = new Map();
  for (const meal of meals) {
    const mealDeals = dealsForMeal(meal, storeDeals, overrides);
    if (mealDeals.length) dealsByMealId.set(meal.id, mealDeals);
  }
  return {
    period: dealPeriod(now),
    storeRanking,
    storeId,
    dealsByMealId,
    preferredMealIds: new Set(dealsByMealId.keys()),
    mainByMealId: new Map(meals.map((meal) => [meal.id, mainIngredientCategories(meal, overrides)]))
  };
}

module.exports = {
  MAIN_INGREDIENT_CATEGORIES,
  dealMatchesIngredient,
  dealPeriod,
  dealsForMeal,
  getDealPlanning,
  ingredientCategory,
  mainIngredientCategories,
  rankStores
};
