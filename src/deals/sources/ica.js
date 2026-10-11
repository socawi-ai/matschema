// ICA: a store's offers page (ica.se/erbjudanden/<store-slug>/) embeds the
// week's offers in the page state (window.__INITIAL_DATA__), under
// "weeklyOffers". There's no separate API for it.
const { extractJsonArray, fetchText, toIso } = require('../util');

function offersUrl(storeSlug) {
  return `https://www.ica.se/erbjudanden/${encodeURIComponent(storeSlug)}/`;
}

// ICA gives the last day of an offer as midnight ("2026-10-11T00:00:00"),
// meaning the offer runs through that day, so use the end of that day.
function endOfDay(value) {
  return typeof value === 'string' ? value.replace(/T00:00:00(\.0+)?$/, 'T23:59:59') : value;
}

function parseOffers(html) {
  const offers = extractJsonArray(html, 'weeklyOffers');
  if (!offers) {
    throw new Error('hittade inga erbjudanden på ICA-sidan (sidan kan ha ändrats)');
  }
  return offers.map((offer) => {
    const details = offer.details || {};
    const storePrice = (offer.stores || [])[0] || {};
    const firstEan = (offer.eans || [])[0] || {};
    return {
      externalId: String(offer.id),
      name: details.name,
      brand: details.brand || null,
      size: details.packageInformation || null,
      dealText: details.mechanicInfo || '',
      price: null,
      regularPrice: storePrice.regularPrice ? `${storePrice.regularPrice} kr` : null,
      comparePrice: offer.comparisonPrice || null,
      memberOnly: (offer.traits || []).includes('Stammis'),
      limitText: offer.restriction || offer.condition || null,
      category: (offer.category && offer.category.articleGroupName) || null,
      validFrom: null,
      validTo: toIso(endOfDay(offer.validTo)),
      imageUrl: firstEan.image || null,
      url: null
    };
  });
}

async function fetchDeals(store) {
  return parseOffers(await fetchText(offersUrl(store.external_id)));
}

module.exports = { fetchDeals, parseOffers };
