const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MATSCHEMA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-deals-'));

const willys = require('../src/deals/sources/willys');
const ica = require('../src/deals/sources/ica');
const coop = require('../src/deals/sources/coop');
const lidl = require('../src/deals/sources/lidl');
const { extractJsonArray, formatSek, toIso } = require('../src/deals/util');

// Trimmed copies of real responses from each chain (October 2026).
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', 'deals', name), 'utf8');

test('helpers', () => {
  assert.equal(formatSek(29.9), '29,90');
  assert.equal(formatSek(109), '109');
  assert.equal(toIso('08/10-2026'), new Date(2026, 9, 8).toISOString());
  assert.equal(toIso(1791755999000), '2026-10-11T21:59:59.000Z');
  assert.equal(toIso(''), null);
  assert.equal(toIso('nonsense'), null);
  assert.deepEqual(extractJsonArray('x = {"a":1,"list":[{"s":"]}\\"","u":undefined}],"b":2}', 'list'), [
    { s: ']}"', u: null }
  ]);
  assert.equal(extractJsonArray('{"other":[]}', 'list'), null);
});

test('Willys offers', () => {
  const [pumpkin, twoFor, member] = willys.parseOffers(JSON.parse(fixture('willys.json')));
  assert.equal(pumpkin.name, 'Delade pumpor');
  assert.equal(pumpkin.dealText, '19,90 kr/kg');
  assert.equal(pumpkin.memberOnly, false);
  assert.equal(twoFor.dealText, '2 för 15,00 kr');
  assert.equal(twoFor.price, 15);
  assert.equal(member.name, 'Fläskfilé');
  assert.equal(member.dealText, '139 kr/kg');
  assert.equal(member.memberOnly, true);
  assert.equal(member.limitText, 'Max 3 köp');
  assert.equal(member.regularPrice, '169,00 kr');
  assert.equal(member.validTo, '2026-10-11T21:59:59.000Z');
});

test('ICA offers from the embedded page state', () => {
  const [shrimp, candles] = ica.parseOffers(fixture('ica.html'));
  assert.equal(shrimp.name, 'Handskalade räkor');
  assert.equal(shrimp.brand, 'ICA');
  assert.equal(shrimp.size, '570 g');
  assert.equal(shrimp.dealText, '79 kr/st');
  assert.equal(shrimp.memberOnly, true, 'Stammis offer');
  assert.equal(shrimp.limitText, 'Max 2 köp/hushåll');
  assert.equal(shrimp.category, 'Färskvaror');
  assert.equal(new Date(shrimp.validTo).getDate(), 11);
  assert.equal(new Date(shrimp.validTo).getHours(), 23, 'valid through the whole last day');
  assert.equal(candles.dealText, '2 för 119 kr');
  assert.throws(() => ica.parseOffers('<html>ingen data</html>'), /hittade inga erbjudanden/);
});

test('Coop offers', () => {
  const [perKg, twoFor, perPiece] = coop.parseOffers(JSON.parse(fixture('coop.json')));
  assert.equal(perKg.name, 'Satsumas');
  assert.equal(perKg.dealText, '20 kr/kg');
  assert.equal(perKg.memberOnly, true);
  assert.equal(twoFor.dealText, '2 för 109 kr');
  assert.equal(twoFor.size, '700 g.');
  assert.equal(perPiece.dealText, '25 kr/st');
  assert.equal(perPiece.memberOnly, false);
  assert.ok(perKg.imageUrl.startsWith('https://'));
  assert.throws(() => coop.parseOffers({ error: 'x' }), /oväntat svar/);
});

test('Lidl campaign pages and products', () => {
  assert.deepEqual(lidl.findCampaignPages(fixture('lidl-home.html')), ['/c/superklipp-fran-torsdag/a10103955']);

  const products = lidl.parseProducts(fixture('lidl-page.html'));
  assert.deepEqual(
    products.map((p) => p.name),
    ['Arla Präst®', "VITA D'OR Rapsolja", 'MATRIKET Mild lättyoghurt vanilj', 'Bananer', 'RYNECZEK LIDLA Gurka'],
    'non-food skipped, fruit & vegetables (F+V) kept'
  );
  const [cheese, oil, yoghurt, bananas, cucumber] = products;
  assert.equal(cheese.dealText, '74,90 kr/kg (ca 720 g)');
  assert.equal(cheese.regularPrice, '111,90 kr');
  assert.equal(cheese.memberOnly, false);
  assert.equal(oil.memberOnly, true, 'Lidl Plus price');
  assert.equal(oil.dealText, '17,90 kr');
  assert.equal(yoghurt.size, '1 kg');
  assert.equal(cheese.url, 'https://www.lidl.se/p/arla-prast/p11217517');

  // Validity comes from the "I butik" period, not the price's publish date.
  assert.equal(cheese.validFrom, '2026-10-07T22:00:00.000Z', 'Thursday 8/10, Swedish time');
  assert.equal(cheese.validTo, '2026-10-11T21:59:59.000Z');
  assert.deepEqual([bananas.validFrom, bananas.validTo], ['2026-10-11T22:00:00.000Z', '2026-10-18T21:59:59.000Z'], 'next week, 12/10–18/10');
  assert.equal(bananas.dealText, '14,90 kr/kg');
  assert.equal(cucumber.validFrom, '2026-09-27T22:00:00.000Z', 'of a past and an upcoming period, the one matching the current price');
});

test('stored deals: replace, filter by date and store, keep old deals when a fetch fails', async () => {
  const deals = require('../src/data/deals');
  const service = require('../src/deals');

  const stores = await deals.getDealStores();
  assert.deepEqual(stores.map((s) => s.id), ['willys:2120', 'ica:1003733', 'ica:1004224', 'coop:231900', 'lidl:se']);

  const now = new Date('2026-10-08T12:00:00Z');
  const deal = (externalId, validFrom, validTo) => ({ externalId, name: externalId, dealText: '10 kr', validFrom, validTo });
  await deals.replaceStoreDeals('willys:2120', [
    deal('current', '2026-10-05T00:00:00Z', '2026-10-11T21:59:59Z'),
    deal('expired', '2026-09-28T00:00:00Z', '2026-10-04T21:59:59Z'),
    deal('next-week', '2026-10-12T00:00:00Z', '2026-10-18T21:59:59Z'),
    deal('far-future', '2026-11-01T00:00:00Z', '2026-11-08T21:59:59Z')
  ]);
  assert.deepEqual((await deals.getCurrentDeals(now)).map((d) => d.externalId), ['current', 'next-week']);

  // A later fetch replaces the store's deals entirely.
  await deals.replaceStoreDeals('willys:2120', [deal('current', null, null)]);
  assert.deepEqual((await deals.getCurrentDeals(now)).map((d) => d.externalId), ['current']);

  // Turning a store off hides its deals.
  await deals.setDealStoreEnabled('willys:2120', false);
  assert.equal((await deals.getCurrentDeals(now)).length, 0);
  await deals.setDealStoreEnabled('willys:2120', true);

  // A failing source records the error but keeps the previous deals.
  const original = service.SOURCES.willys.fetchDeals;
  service.SOURCES.willys.fetchDeals = async () => {
    throw new Error('willys.se svarade 503');
  };
  const disableOthers = ['ica:1003733', 'ica:1004224', 'coop:231900', 'lidl:se'];
  for (const id of disableOthers) await deals.setDealStoreEnabled(id, false);
  try {
    const results = await service.refreshDeals();
    assert.deepEqual(results, [{ store: 'Willys Östersund', ok: false, error: 'willys.se svarade 503' }]);
  } finally {
    service.SOURCES.willys.fetchDeals = original;
  }
  const willysStore = (await deals.getDealStores()).find((s) => s.id === 'willys:2120');
  assert.equal(willysStore.last_error, 'willys.se svarade 503');
  assert.equal(willysStore.deal_count, 1);
  assert.equal((await deals.getCurrentDeals(now)).length, 1, 'previous deals kept');
});

test('refresh timing', () => {
  const { isStale } = require('../src/deals');
  const now = Date.parse('2026-10-08T12:00:00Z');
  const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();
  assert.equal(isStale({ last_success_at: null, last_attempt_at: null }, now), true, 'never fetched');
  assert.equal(isStale({ last_success_at: hoursAgo(3) }, now), false);
  assert.equal(isStale({ last_success_at: hoursAgo(13) }, now), true);
  assert.equal(isStale({ last_success_at: hoursAgo(20), last_attempt_at: hoursAgo(1), last_error: 'x' }, now), false, 'wait before retrying');
  assert.equal(isStale({ last_success_at: hoursAgo(20), last_attempt_at: hoursAgo(3), last_error: 'x' }, now), true);

  const sunday = new Date(2026, 9, 11, 12).getTime();
  const sundayHoursAgo = (h) => new Date(sunday - h * 3600 * 1000).toISOString();
  assert.equal(isStale({ last_success_at: sundayHoursAgo(4) }, sunday), true, 'every 3 hours on weekends');
  assert.equal(isStale({ last_success_at: sundayHoursAgo(2) }, sunday), false);
});

test('manual categories win over the rules, and new product names are tracked', async () => {
  const deals = require('../src/data/deals');
  const { getDealsForDisplay } = require('../src/deals/display');
  const now = new Date();
  const find = async (name, at = now) => (await getDealsForDisplay(at)).find((d) => d.name === name);

  await deals.setDealStoreEnabled('willys:2120', true);
  await deals.replaceStoreDeals('willys:2120', [
    { externalId: 'a', name: 'Kycklingbröstfilé', dealText: '99 kr/kg' },
    { externalId: 'b', name: 'Gårdsgoda', dealText: '45 kr' }
  ]);

  let chicken = await find('Kycklingbröstfilé');
  assert.deepEqual([chicken.everyday, chicken.manualCategory, chicken.isNew], ['kyckling', false, true]);
  assert.equal((await find('Gårdsgoda')).everyday, null, 'unknown brand name: not classified');

  // Corrections are keyed on the name, ignoring case and spacing.
  await deals.setCategoryOverride('  GÅRDSGODA ', 'agg');
  const eggs = await find('Gårdsgoda');
  assert.deepEqual([eggs.everyday, eggs.manualCategory], ['agg', true]);

  await deals.setCategoryOverride('Kycklingbröstfilé', 'none');
  chicken = await find('Kycklingbröstfilé');
  assert.deepEqual([chicken.everyday, chicken.manualCategory], [null, true], '"not everyday"');

  await deals.setCategoryOverride('Kycklingbröstfilé', null);
  chicken = await find('Kycklingbröstfilé');
  assert.deepEqual([chicken.everyday, chicken.manualCategory], ['kyckling', false], 'back to automatic');

  // A later fetch keeps the first-seen time; a week later the name is no longer new.
  const firstSeen = chicken.firstSeenAt;
  await deals.replaceStoreDeals('willys:2120', [{ externalId: 'a', name: 'Kycklingbröstfilé', dealText: '89 kr/kg' }]);
  assert.equal((await find('Kycklingbröstfilé')).firstSeenAt, firstSeen);
  const nextWeek = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
  assert.equal((await find('Kycklingbröstfilé', nextWeek)).isNew, false);
});
