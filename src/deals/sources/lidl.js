// Lidl: offers are national, published as weekly campaign pages linked from
// lidl.se (e.g. "Veckans frukt & grönt", "Superklipp från torsdag",
// "Lidl Plus-erbjudanden"; usually this week's and next week's version).
// Each product tile carries its data in a data-grid-data attribute. Prices
// are given per region, but have been identical across regions, so the
// first region with a price is used.
const { fetchText, formatSek, toIso } = require('../util');

const BASE = 'https://www.lidl.se';

function decodeHtmlAttribute(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Campaign pages that never contain food. Only an optimization (fewer
// requests): products are filtered on their own category anyway.
const NON_FOOD_PAGES = /blommor|kok-hushall|koek-hushall|mode|hem-inredning|baby|husdjur|verktyg|tradgard|traedgard|leksaker/;

// Campaign pages are "/c/<slug>/a<id>" links on the start page.
function findCampaignPages(html) {
  const pages = [...html.matchAll(/href="(\/c\/([a-z0-9-]+)\/a\d+)"/g)]
    .filter((m) => !NON_FOOD_PAGES.test(m[2]))
    .map((m) => m[1]);
  return [...new Set(pages)];
}

// The period the offer is in store, e.g. "I butik 12/10 - 18/10". A product
// can list several periods (past and upcoming campaigns); use the one that
// ends with the offer price, else the next upcoming one. The price's own
// startDate is when the price was published, not when the offer starts.
function inStorePeriod(item, priceEnd) {
  const periods = ((item.stockAvailability && item.stockAvailability.badgeInfoV2) || [])
    .filter((p) => Number.isFinite(p.validFrom) && Number.isFinite(p.validUntil))
    .map((p) => ({ from: p.validFrom * 1000, to: p.validUntil * 1000 }));
  const end = priceEnd ? Date.parse(priceEnd) : NaN;
  const matching = periods.find((p) => Math.abs(p.to - end) < 60 * 60 * 1000);
  const upcoming = periods.filter((p) => p.to >= Date.now()).sort((a, b) => a.from - b.from)[0];
  return matching || upcoming || null;
}

function parseProducts(html) {
  const products = [];
  for (const match of html.matchAll(/data-grid-data="([^"]*)"/g)) {
    let item;
    try {
      item = JSON.parse(decodeHtmlAttribute(match[1]));
    } catch {
      continue;
    }
    // Categories seen: Food, F+V (fruit & vegetables), NonFood.
    if (item.category === 'NonFood') continue;

    const region = Object.values(item.regionsPrices || {}).find((r) => r.currentPrice || r.currentLidlPlusPrice);
    if (!region) continue;
    // Ordinary offers hold the price fields directly; Lidl Plus (member)
    // offers wrap them in an extra { price: {...} }.
    const memberOnly = !region.currentPrice;
    const price = region.currentPrice || (region.currentLidlPlusPrice && region.currentLidlPlusPrice.price) || {};
    if (typeof price.price !== 'number') continue;

    // basePrice is either a unit ("/kg (ca 720 g)") or a comparison price ("42,72 kr/kg").
    const baseText = ((price.basePrice && price.basePrice.text) || '').trim();
    const unitText = baseText.startsWith('/') ? baseText : '';
    const packaging = price.packaging || (item.price && item.price.packaging) || {};
    const categoryPath = (item.keyfacts && item.keyfacts.wonCategoryPrimary) || '';
    const period = inStorePeriod(item, price.endDate);
    products.push({
      externalId: `${item.productId}:${price.endDate || ''}`,
      name: item.fullTitle || item.title,
      brand: (item.brand && item.brand.name) || null,
      size: packaging.text || null,
      dealText: `${formatSek(price.price)} kr${unitText}`,
      price: price.price,
      regularPrice: typeof price.oldPrice === 'number' ? `${formatSek(price.oldPrice)} kr` : null,
      comparePrice: unitText ? null : baseText || null,
      memberOnly,
      limitText: null,
      category: categoryPath.split('/').pop() || null,
      validFrom: period ? toIso(period.from) : toIso(price.startDate),
      validTo: period ? toIso(period.to) : toIso(price.endDate),
      imageUrl: (item.imageList_V1 && item.imageList_V1[0] && item.imageList_V1[0].image) || null,
      url: item.canonicalUrl ? BASE + item.canonicalUrl : null
    });
  }
  return products;
}

async function fetchDeals() {
  const pages = findCampaignPages(await fetchText(`${BASE}/`));
  if (!pages.length) {
    throw new Error('hittade inga kampanjsidor på lidl.se (sidan kan ha ändrats)');
  }

  const byId = new Map();
  for (const page of pages) {
    for (const deal of parseProducts(await fetchText(BASE + page))) {
      byId.set(deal.externalId, deal);
    }
  }
  return [...byId.values()];
}

module.exports = { fetchDeals, findCampaignPages, parseProducts };
