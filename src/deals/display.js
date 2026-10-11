const { getCategoryOverrides, getCurrentDeals } = require('../data/deals');
const { nameKey } = require('../data/deal-name');
const { EVERYDAY_CATEGORIES, classifyDeal } = require('./categories');

// A product name first seen this recently counts as new.
const NEW_DEAL_MS = 7 * 24 * 60 * 60 * 1000;

// Deals for the admin list: each gets its everyday category (or null) – a
// manual correction if there is one, otherwise the automatic rules – and
// whether its name is new. The list is ordered by category, then name, so
// the same kind of product from different stores ends up side by side.
// Uncategorized deals go last.
async function getDealsForDisplay(now = new Date()) {
  const categoryOrder = new Map(EVERYDAY_CATEGORIES.map((category, index) => [category.id, index]));
  const overrides = await getCategoryOverrides();
  const order = (deal) => (deal.everyday ? categoryOrder.get(deal.everyday) : EVERYDAY_CATEGORIES.length);
  return (await getCurrentDeals(now))
    .map((deal) => {
      const override = overrides.get(nameKey(deal.name));
      const manual = override === 'none' || categoryOrder.has(override);
      return {
        ...deal,
        everyday: manual ? (override === 'none' ? null : override) : classifyDeal(deal),
        manualCategory: manual,
        isNew: Boolean(deal.firstSeenAt) && now.getTime() - Date.parse(deal.firstSeenAt) < NEW_DEAL_MS
      };
    })
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' }));
}

module.exports = { getDealsForDisplay, NEW_DEAL_MS };
