const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MATSCHEMA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-shopping-'));

const store = require('../src/data/store');
const { buildShoppingList, dealInfo, getPublicShopping } = require('../src/deals/shopping');

const MEALS = [
  { id: 'gryta', name: 'Kycklinggryta', ingredients: ['Kyckling', 'Curry', 'Ris'] },
  { id: 'pasta', name: 'Krämig kycklingpasta', ingredients: ['Kyckling', 'Pasta', 'Grädde'] },
  { id: 'lasagne', name: 'Lasagne', ingredients: ['Nötfärs', 'Pasta', 'Ost'] },
  { id: 'risotto', name: 'Svamprisotto', ingredients: ['Arborioris', 'Svamp'] }
];
const deal = (name, everyday, extra = {}) => ({ storeId: 'w', name, everyday, dealText: '89,90 kr/kg', ...extra });
const CHICKEN = deal('Kycklingbröstfilé', 'kyckling', { brand: 'Kronfågel', size: '900 g', memberOnly: true });
const MINCE = deal('Nötfärs', 'kottfars', { comparePrice: '99:88 kr/kg', limitText: 'Max 3 köp' });
const SALMON = deal('Laxfilé', 'fisk');

const entry = (date, mealId) => ({ date, mealId, mealName: mealId });
const WEEKS = [{
  weekStart: '2026-10-12',
  entries: [
    entry('2026-10-15', 'gryta'), // before the period
    entry('2026-10-16', 'lasagne'),
    entry('2026-10-17', 'risotto'),
    entry('2026-10-19', 'pasta'),
    entry('2026-10-21', 'gryta'),
    entry('2026-11-02', 'lasagne') // after the period
  ]
}];
const PERIOD = { from: '2026-10-16', to: '2026-11-02' };

test('the shopping list has the offers for planned meals, grouped by main ingredient', () => {
  const { groups, mealDeals } = buildShoppingList(WEEKS, MEALS, [SALMON, MINCE, CHICKEN], PERIOD);

  assert.deepEqual(groups.map((g) => g.id), ['kottfars', 'kyckling'], 'in category order; salmon is for no planned meal');
  const [mince, chicken] = groups.map((g) => g.deals[0]);
  assert.equal(mince.name, 'Nötfärs');
  assert.deepEqual(mince.meals, [{ name: 'Lasagne', days: ['fre 16/10'] }], 'only days in the period');
  assert.equal(chicken.extra, 'Kronfågel, 900 g');
  assert.deepEqual(chicken.meals, [
    { name: 'Krämig kycklingpasta', days: ['mån 19/10'] },
    { name: 'Kycklinggryta', days: ['ons 21/10'] }
  ], 'meals by first day');

  assert.deepEqual([...mealDeals.keys()].sort(), ['gryta', 'lasagne', 'pasta']);
  assert.equal(mealDeals.get('pasta')[0].name, 'Kycklingbröstfilé');
});

test('no offers for planned meals gives an empty list', () => {
  const { groups, mealDeals } = buildShoppingList(WEEKS, MEALS, [SALMON], PERIOD);
  assert.deepEqual(groups, []);
  assert.equal(mealDeals.size, 0);
});

test('an offer’s details as short texts', () => {
  assert.deepEqual(dealInfo({ ...MINCE, validTo: new Date(2026, 9, 18, 23, 59).toISOString() }), [
    '89,90 kr/kg', 'jmf 99:88 kr/kg', 'Max 3 köp', 't.o.m. sön 18/10'
  ]);
  assert.deepEqual(dealInfo(CHICKEN), ['89,90 kr/kg', 'Medlemspris']);
});

test('the public shopping list follows the plan’s store and period, prominent until the shop', async () => {
  assert.equal(await getPublicShopping(new Date(2026, 9, 13, 9)), null, 'no plan made with offers');

  const plan = { storeId: 'willys:2120', from: '2026-10-16', to: '2026-11-02', plannedAt: new Date(2026, 9, 12, 18).toISOString() };
  await store.saveSetting('dealPlan', plan);

  const tuesday = await getPublicShopping(new Date(2026, 9, 13, 9));
  assert.equal(tuesday.storeName, 'Willys Östersund');
  assert.equal(tuesday.periodLabel, '16/10–1/11');
  assert.equal(tuesday.from, '2026-10-16');
  assert.equal(tuesday.prominent, true);

  const saturday = await getPublicShopping(new Date(2026, 9, 17, 9));
  assert.equal(saturday.prominent, false, 'after the shop');
  assert.equal(saturday.from, '2026-10-17', 'past days left out');

  assert.equal((await getPublicShopping(new Date(2026, 9, 20, 9))).prominent, false, 'next week, before the new plan');
  assert.equal(await getPublicShopping(new Date(2026, 10, 2, 9)), null, 'the period is over');

  await store.saveSetting('dealPlan', { ...plan, storeId: 'gone:1' });
  assert.equal(await getPublicShopping(new Date(2026, 9, 13, 9)), null, 'store removed');
});
