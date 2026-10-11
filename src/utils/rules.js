const { DAYS } = require('./scheduler');

const DEFAULT_RULES = {
  planningHorizonWeeks: 3,
  fishMealsPerWeek: 1,
  vegetarianMealsPerWeek: 1,
  specialDays: ['Fredag', 'Lördag'],
  sameSpecialAcrossSpecialDays: true,
  vegetarianAllowedDays: ['Måndag', 'Onsdag', 'Torsdag', 'Söndag'],
  // Pick meals whose main ingredient is on offer first (see meal-deals.js).
  prioritizeDeals: true,
  // Stores (deal_stores ids) used for the big weekly shop. Only one of them
  // is visited per shop: shoppingStore, or 'auto' for the one with deals
  // for the most meals.
  shoppingStores: ['willys:2120', 'ica:1003733', 'ica:1004224'],
  shoppingStore: 'auto'
};

// Parses an integer and clamps it to [min, max]. Only falls back when the
// value is missing or not a number, so 0 is a valid choice.
function intInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseDaysInput(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/\r?\n|,/);
  return list.map((day) => String(day || '').trim()).filter((day) => day && DAYS.includes(day));
}

function normalizeRules(rawRules) {
  const rules = { ...DEFAULT_RULES, ...(rawRules || {}) };
  rules.planningHorizonWeeks = intInRange(rules.planningHorizonWeeks, DEFAULT_RULES.planningHorizonWeeks, 1, 12);
  rules.fishMealsPerWeek = intInRange(rules.fishMealsPerWeek, DEFAULT_RULES.fishMealsPerWeek, 0, 7);
  rules.vegetarianMealsPerWeek = intInRange(rules.vegetarianMealsPerWeek, DEFAULT_RULES.vegetarianMealsPerWeek, 0, 7);
  rules.specialDays = Array.isArray(rules.specialDays)
    ? rules.specialDays.filter((d) => DAYS.includes(d))
    : [...DEFAULT_RULES.specialDays];
  rules.vegetarianAllowedDays = Array.isArray(rules.vegetarianAllowedDays)
    ? rules.vegetarianAllowedDays.filter((d) => DAYS.includes(d))
    : [...DEFAULT_RULES.vegetarianAllowedDays];
  rules.sameSpecialAcrossSpecialDays = Boolean(rules.sameSpecialAcrossSpecialDays);
  rules.prioritizeDeals = rules.prioritizeDeals !== false;
  rules.shoppingStores = Array.isArray(rules.shoppingStores)
    ? rules.shoppingStores.map(String).filter(Boolean)
    : [...DEFAULT_RULES.shoppingStores];
  rules.shoppingStore = typeof rules.shoppingStore === 'string' && rules.shoppingStore ? rules.shoppingStore : 'auto';
  return rules;
}

module.exports = {
  DEFAULT_RULES,
  normalizeRules,
  parseDaysInput
};
