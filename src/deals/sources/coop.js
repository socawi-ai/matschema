// Coop: the offers API that coop.se's store pages call. It needs the
// subscription key that coop.se publishes in its own page config, so the key
// is read from the store page on each fetch rather than hard-coded here.
const { fetchJson, fetchText, formatSek, toIso } = require('../util');

const STORE_PAGE = 'https://www.coop.se/butiker-erbjudanden/';

async function getSubscriptionKey() {
  const html = await fetchText(STORE_PAGE);
  const match = html.match(/"extApimSubscriptionKey":"([0-9a-f]+)"/);
  if (!match) {
    throw new Error('hittade inte Coops API-nyckel (sidan kan ha ändrats)');
  }
  return match[1];
}

function parseOffers(offers) {
  if (!Array.isArray(offers)) {
    throw new Error('oväntat svar från Coop');
  }
  return offers.map((offer) => {
    const content = offer.content || {};
    const price = offer.priceInformation || {};
    const splash = offer.unifiedSplash || {};
    const amount = `${formatSek(price.discountValue)} kr`;
    const dealText = splash.prefix ? `${splash.prefix} ${amount}` : `${amount}/${price.unit || 'st'}`;
    return {
      externalId: String(offer.id),
      name: content.title,
      brand: content.brand || null,
      size: content.amountInformation || null,
      dealText,
      price: typeof price.discountValue === 'number' ? price.discountValue : null,
      regularPrice: null,
      comparePrice: null,
      memberOnly: Boolean(price.isMemberPrice),
      limitText: null,
      category: (offer.categoryTeam && offer.categoryTeam.name) || null,
      validFrom: toIso(offer.campaignStartDate),
      validTo: toIso(offer.campaignEndDate),
      imageUrl: content.imageUrl ? `https:${content.imageUrl.replace(/^https?:/, '')}` : null,
      url: null
    };
  });
}

async function fetchDeals(store) {
  const key = await getSubscriptionKey();
  const offers = await fetchJson(
    `https://external.api.coop.se/dke/offers/${encodeURIComponent(store.external_id)}?api-version=v2&clustered=true`,
    { headers: { 'Ocp-Apim-Subscription-Key': key } }
  );
  return parseOffers(offers);
}

module.exports = { fetchDeals, parseOffers };
