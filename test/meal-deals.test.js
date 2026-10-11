const test = require('node:test');
const assert = require('node:assert/strict');

const { dealMatchesIngredient, dealPeriod, dealsForMeal, mainIngredientCategories, rankStores } = require('../src/deals/meal-deals');

const meal = (...ingredients) => ({ ingredients });
const day = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

test('a meal’s main ingredient is its protein category', () => {
  assert.deepEqual(mainIngredientCategories(meal('Kyckling', 'Pasta', 'Grädde', 'Vitlök', 'Parmesan')), ['kyckling']);
  assert.deepEqual(mainIngredientCategories(meal('Nötfärs', 'Potatis', 'Tomatsås', 'Lök', 'Ost')), ['kottfars']);
  assert.deepEqual(mainIngredientCategories(meal('Högrev', 'Rödvin', 'Morot')), ['kott']);
  assert.deepEqual(mainIngredientCategories(meal('Bacon', 'Spaghetti', 'Ägg')), ['korv']);
  assert.deepEqual(mainIngredientCategories(meal('Lax', 'Citron', 'Dill', 'Potatis', 'Smör')), ['fisk']);
  assert.deepEqual(mainIngredientCategories(meal('Tofu', 'Nudlar', 'Broccoli')), ['vego']);
  assert.deepEqual(mainIngredientCategories(meal('Nötfärs', 'Kidneybönor', 'Krossade tomater')), ['kottfars'], 'beans are a side when there is meat');
  assert.deepEqual(mainIngredientCategories(meal('Kidneybönor', 'Svarta bönor', 'Paprika')), ['vego']);
  assert.deepEqual(mainIngredientCategories(meal('Arborioris', 'Svamp', 'Parmesan')), [], 'no main ingredient');
  assert.deepEqual(mainIngredientCategories({}), []);
});

test('manual category corrections apply to ingredients too', () => {
  const overrides = new Map([['halloumi', 'vego'], ['kyckling', 'none']]);
  assert.deepEqual(mainIngredientCategories(meal('Halloumi', 'Tortillabröd', 'Sallad'), overrides), ['vego']);
  assert.deepEqual(mainIngredientCategories(meal('Kyckling', 'Pasta'), overrides), []);
});

test('the deal period runs from Friday (or today, if later) to Sunday two weeks ahead', () => {
  // Week 41 of 2026: Monday 5/10 – Sunday 11/10.
  for (const [now, start] of [
    [new Date(2026, 9, 5, 9), '2026-10-9'], // Monday: from Friday
    [new Date(2026, 9, 8, 20), '2026-10-9'], // Thursday evening: from Friday
    [new Date(2026, 9, 9, 12), '2026-10-9'], // Friday
    [new Date(2026, 9, 11, 12), '2026-10-11'] // Sunday: from today
  ]) {
    const period = dealPeriod(now);
    assert.equal(day(period.start), start, now.toString());
    assert.equal(day(period.end), '2026-10-26', 'up to and including Sunday 25/10');
  }
});

// Deals as getDealsForDisplay returns them (everyday category already set).
const deal = (name, everyday, storeId = 'willys:2120') => ({ name, everyday, storeId });

test('a deal must be for the ingredient itself, not just the same category', () => {
  assert.equal(dealMatchesIngredient(deal('Kycklingbröstfilé', 'kyckling'), 'Kyckling', 'kyckling'), true);
  assert.equal(dealMatchesIngredient(deal('Laxfilé 4-pack', 'fisk'), 'Lax', 'fisk'), true);
  assert.equal(dealMatchesIngredient(deal('Högrev', 'kott'), 'Högrev', 'kott'), true);
  assert.equal(dealMatchesIngredient(deal('Bönor, kikärtor, linser', 'vego'), 'Röda linser', 'vego'), true);
  assert.equal(dealMatchesIngredient(deal('Vita bönor 4-pack', 'vego'), 'Kidneybönor', 'vego'), true);
  assert.equal(dealMatchesIngredient(deal('Norrlandsfalukorv', 'korv'), 'Falukorv', 'korv'), true);

  assert.equal(dealMatchesIngredient(deal('Fryst kryddad kyckling', 'kyckling'), 'Kycklingklubbor', 'kyckling'), false, 'not the other way round');
  assert.equal(dealMatchesIngredient(deal('Fläskfärs', 'kottfars'), 'Nötfärs', 'kottfars'), false, 'same category is not enough');
  assert.equal(dealMatchesIngredient(deal('Skinkstek', 'kott'), 'Högrev', 'kott'), false);
  assert.equal(dealMatchesIngredient(deal('Laxfilé', 'fisk'), 'Lax', 'kott'), false, 'category must match');
});

test('a meal’s deals come from its main ingredients only', () => {
  const pasta = { ingredients: ['Kyckling', 'Pasta', 'Grädde'] };
  const deals = [deal('Kycklingbröstfilé', 'kyckling'), deal('Pasta', 'pasta'), deal('Grädde', 'mejeri')];
  assert.deepEqual(dealsForMeal(pasta, deals).map((d) => d.name), ['Kycklingbröstfilé'], 'pasta and cream deals do not count');
  assert.deepEqual(dealsForMeal({ ingredients: ['Svamp', 'Arborioris'] }, deals), []);
});

test('the store to shop at is the one with deals for the most meals', () => {
  const meals = [
    { id: 'a', ingredients: ['Kyckling'] },
    { id: 'b', ingredients: ['Högrev'] },
    { id: 'c', ingredients: ['Lax'] },
    { id: 'd', ingredients: ['Tofu'] }
  ];
  const deals = [
    deal('Kycklingbröstfilé', 'kyckling', 'willys'),
    deal('Högrev', 'kott', 'ica-kvantum'),
    deal('Laxfilé', 'fisk', 'ica-kvantum'),
    deal('Tofu', 'vego', 'coop') // not a shopping store
  ];
  assert.deepEqual(rankStores(meals, deals, ['willys', 'ica-maxi', 'ica-kvantum']), [
    { storeId: 'ica-kvantum', mealCount: 2 },
    { storeId: 'willys', mealCount: 1 },
    { storeId: 'ica-maxi', mealCount: 0 }
  ]);
});
