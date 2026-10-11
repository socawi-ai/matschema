// Willys: the same campaign search endpoint willys.se uses for a store's
// "Erbjudanden" page. Returns every offer for the store in one request.
const { fetchJson, toIso } = require('../util');

function offersUrl(storeId) {
  return `https://www.willys.se/search/campaigns/offline?q=${encodeURIComponent(storeId)}&type=PERSONAL_GENERAL&page=0&size=500`;
}

// "9,90/st" -> "9,90 kr/st", "139/kg" -> "139 kr/kg", "45,00" -> "45,00 kr"
function withKr(label) {
  return String(label || '').trim().replace(/^([\d\s.,:]+?)(\s*)(\/|\+|$)/, (_m, amount, _space, rest) => {
    return `${amount} kr${rest === '+' ? ' +' : rest}`;
  });
}

function parseOffers(json) {
  return (json.results || []).flatMap((product) => {
    const promotion = (product.potentialPromotions || [])[0];
    if (!promotion) return [];
    const reward = withKr(promotion.rewardLabel || promotion.cartLabel);
    return [
      {
        externalId: `${promotion.code}:${product.code || promotion.mainProductCode || product.name}`,
        name: product.name,
        brand: product.manufacturer || null,
        size: product.displayVolume || promotion.weightVolume || null,
        dealText: promotion.conditionLabel ? `${promotion.conditionLabel} ${reward}` : reward,
        price: typeof promotion.price === 'number' ? promotion.price : null,
        regularPrice: product.price || null,
        comparePrice: promotion.comparePrice || null,
        memberOnly: promotion.campaignType === 'LOYALTY',
        limitText: promotion.redeemLimitLabel || null,
        category: null,
        validFrom: toIso(promotion.startDate),
        validTo: toIso(promotion.validUntil),
        imageUrl: (product.image && product.image.url) || (product.originalImage && product.originalImage.url) || null,
        url: null
      }
    ];
  });
}

async function fetchDeals(store) {
  return parseOffers(await fetchJson(offersUrl(store.external_id)));
}

module.exports = { fetchDeals, parseOffers };
