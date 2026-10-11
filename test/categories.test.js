const test = require('node:test');
const assert = require('node:assert/strict');

const { EVERYDAY_CATEGORIES, classifyDeal, packageSize } = require('../src/deals/categories');

// Real product names from the chains (October 2026), with the store's own
// category where the chain gives one.
const classify = (name, category = null, size = null) => classifyDeal({ name, category, size });

test('every rule and store-category hint points at a defined category', () => {
  const { RULES, STORE_CATEGORY_HINTS } = require('../src/deals/categories');
  const ids = new Set(EVERYDAY_CATEGORIES.map((c) => c.id));
  for (const [id] of RULES) assert.ok(ids.has(id), `rule for unknown category "${id}"`);
  for (const [, id] of STORE_CATEGORY_HINTS) assert.ok(ids.has(id), `hint for unknown category "${id}"`);
});

test('everyday products land in the right category', () => {
  const expected = {
    mejeri: [
      'Arla Laktosfri mellanmjölkdryck', 'Barista havredryck', 'Mellanmjölk 1,5 l',
      'Grädde', 'Matlagnings-/vispgrädde',
      'Crème fraiche', 'Gräddfil', 'Arla Lätt crème fraiche',
      'MATRIKET Mild naturell yoghurt', 'Hälsofil', 'Filmjölk', 'Smaksatt yoghurt', 'Laktosfri Vanilj-, fruktyoghurt',
      'Smör', 'Bordsmargarin', 'Rapsolja', 'ITALIAMO Extra jungfruolivolja'
    ],
    ost: ['Hushållsost', 'Präst®, Herrgård®, Grevé®, Svecia, Dacke', 'Riven ost', 'Arla Gräddis', 'Jarlsberg', 'Klassikerost', 'Präst skivad ost', 'ITALIAMO Parmigiano Reggiano', 'Grana Padano', 'Pecorino Romano'],
    agg: ['Ägg 10-pack'],
    kott: ['Fläskfilé', 'Entrecôte i bit', 'Högrev', 'Lövbiff av innanlår', 'Benfri fläsklägg', 'Fransyska', 'SCAN Färska köttbullar'],
    kottfars: ['Blandfärs', 'Nötfärs', 'Fläskfärs', 'Älgköttfärs', 'MATRIKET Chorizofärs'],
    kyckling: ['Kycklingbröstfilé', 'Kycklinglårfilé', 'Fryst kryddad kyckling', 'MATRIKET Grillkryddade kycklingben'],
    korv: ['Bacon', 'Wienerkorv', 'MATRIKET Falukorv', 'Bacon/stekfläsk', 'Kassler', 'Uddevallare'],
    fisk: ['Laxfilé 4-pack', 'Torskrygg', 'Handskalade räkor', 'Stillahavsflundra', 'Tonfisk i vatten, olja'],
    vego: ['Tofu', 'Bönor, kikärtor, linser', 'Fryst vego'],
    gronsaker: ['Gul lök', 'Champinjoner', 'Brysselkål i påse', 'Delade pumpor', 'Sötpotatis', 'Romansallat', 'Bladpersilja'],
    'frysta-gronsaker': ['FRESHONA Hackad spenat'],
    potatis: ['Potatis 2 kg', 'Mandelpotatis'],
    pasta: ['Spaghetti', 'Gammaldags idealmakaroner', 'Färsk gnocchi'],
    ris: ['Jasminris', 'GOLDEN SUN Basmatiris Långkornigt', 'Ekologiska Havregryn', 'Nudlar', 'Grötris'],
    mjol: ['Rörsocker strö', 'Vetemjöl 2 kg'],
    kaffe: ['Kaffe', 'BELLAROM Mellanrost', 'Te 17-pack', 'ITALIAMO Kaffebönor']
  };
  const categories = {
    'FRESHONA Hackad spenat': 'Frysta frukter och grönsaker',
    'Fryst kryddad kyckling': 'Djupfryst',
    'Fryst vego': 'Djupfryst',
    'Bacon/stekfläsk': 'Chark/Deli/Färdigmat',
    'MATRIKET Chorizofärs': 'Fläskkött',
    'Bladpersilja': 'Färska örter'
  };
  for (const [id, names] of Object.entries(expected)) {
    for (const name of names) {
      assert.equal(classify(name, categories[name]), id, name);
    }
  }
});

test('things that only look like everyday products are left out', () => {
  const notEveryday = [
    // Words hiding inside other words.
    ['Kokosmjölk'], // "mjöl" in "kokosmjölk"
    ['Ekologisk kokosmjölk, kokosgrädde'],
    ['Frukost'], // "ost" ending
    // Snacks, sweets, drinks, bread.
    ['HALLOWEEN Mjölkchoklad', 'Chokladvaror'],
    ['Cheez doodles Maxipack', 'Smakrika snacks'],
    ['Energidryck'],
    ['Proteindryck', 'Mejeri'],
    ['Korvbröd 16-pack'],
    ['Lantbröd, potatisbröd'],
    ['Iskaffe', 'Mejeri'],
    // Ready meals, coated or fried, cold cuts.
    ['Potatisgratäng, rotfruktsgratäng'],
    ['Fryst lasagne', 'Djupfryst'],
    ['MCENNEDY Panerad kyckling', 'Fryst kött och fågel'],
    ['MCENNEDY Panerad mozzarella', 'Ost'],
    ['Kycklingkebab', 'Fryst kött och fågel'],
    ['Rökt kalkon', 'Korv & charkuterier'],
    ['Rökt skinka, kokt skinka'],
    ['ITALIAMO Lufttorkad salami', 'Korv & charkuterier'],
    // Canned goods and sauces (not chosen as categories).
    ['Krossade, passerade tomater'],
    ['Risgrynsgröt'],
    ['Inlagd sill'],
    ['Senapssill'],
    ['Salladsbaren'],
    ['ITALIAMO Béchamelsås', 'Mjölk & grädde'],
    // Non-food.
    ['Hundmat', 'Hundmat'],
    ['Kycklingsnacks', 'Fjäderfä'],
    ['Diskmedel'],
    ['Vita kronljus 30-pack']
  ];
  for (const [name, category] of notEveryday) {
    assert.equal(classify(name, category), null, name);
  }
});

test('yoghurt is only ordinary breakfast yoghurt and filmjölk', () => {
  assert.equal(packageSize('1kg'), 1000);
  assert.equal(packageSize('1 l'), 1000);
  assert.equal(packageSize('150 g.'), 150);
  assert.equal(packageSize('250 ml, 330 ml'), 330);
  assert.equal(packageSize('Ca 500-800 g.'), 800);
  assert.equal(packageSize(null), null);

  assert.equal(classify('Mild yoghurt naturell, vanilj', 'Mejeri', '1 kg'), 'mejeri');
  assert.equal(classify('MATRIKET Fruktyoghurt jordgubb', 'Yoghurt', '1 l'), 'mejeri');
  assert.equal(classify('Hälsofil', null, '1 kg'), 'mejeri');
  for (const [name, size, category] of [
    ['Kvarg', '150g'],
    ['Yoghurtkvarg naturell', '1 kg', 'Yoghurt'],
    ['Drickyoghurt', '250g'],
    ['Drickkvarg', '250 ml, 330 ml'],
    ['ITALIAMO Dessertyoghurt', '150 g', 'Yoghurt'],
    ['Yoghurt körsbär', '250 g', 'Yoghurt'],
    ['Skyr', '1 kg'],
    ['Keso', '500 g']
  ]) {
    assert.equal(classify(name, category, size), null, `${name} (${size})`);
  }
});

test('cheese is only sliceable and hard grating cheese', () => {
  for (const name of [
    'Mozzarella', 'Lovilio Buffelmozzarella', 'ITALIAMO Miniburrata', 'Brie de meaux', 'Kolibrie brieost',
    'ITALIAMO Mascarpone', 'ITALIAMO Mascarpone med gorgonzola', 'Philadelphia Färskost', 'Mjukost i tub',
    'Dessertost', 'Cottage cheese', 'Scamorza', 'Halloumi', 'Feta'
  ]) {
    assert.equal(classify(name, 'Ost'), null, name);
  }
});

test('store categories help when the name alone is not enough', () => {
  assert.equal(classify('Milda Culinesse', 'Oljor och fetter'), 'mejeri');
  assert.equal(classify('FINDUS Fish & Crisp gourmetfiléer', 'Fryst fisk och skaldjur'), 'fisk');
  assert.equal(classify('Billinge 26% skivad', 'Ost'), 'ost');
  assert.equal(classify('Laxfilé', 'Fisk & skaldjur'), 'fisk', '"skaldjur" must not count as pet food');
  assert.equal(classify('ITALIAMO Porchetta', 'Fläskkött'), 'kott', '"Fläskkött" must not count as soda');
  assert.equal(classify('Anamma Vegofärs', 'Färdigmat från frysdisk'), 'vego', 'plant protein kept despite ready-meal category');
});
