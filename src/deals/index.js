const {
  getDealStores,
  recordDealStoreError,
  replaceStoreDeals
} = require('../data/deals');

const SOURCES = {
  willys: require('./sources/willys'),
  ica: require('./sources/ica'),
  coop: require('./sources/coop'),
  lidl: require('./sources/lidl')
};

// Offers change at most daily; refresh a store when its last successful
// fetch is older than this, and retry a failed one after RETRY_AFTER.
// Next week's offers tend to appear over the weekend, so check more often then.
const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;
const WEEKEND_REFRESH_AFTER_MS = 3 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 2 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

function isStale(store, now = Date.now()) {
  const lastSuccess = store.last_success_at ? Date.parse(store.last_success_at) : 0;
  const lastAttempt = store.last_attempt_at ? Date.parse(store.last_attempt_at) : 0;
  const day = new Date(now).getDay();
  const refreshAfter = day === 0 || day === 6 ? WEEKEND_REFRESH_AFTER_MS : REFRESH_AFTER_MS;
  if (now - lastSuccess < refreshAfter) return false;
  return !store.last_error || now - lastAttempt >= RETRY_AFTER_MS;
}

async function refreshStore(store) {
  const source = SOURCES[store.chain];
  try {
    if (!source) throw new Error(`okänd kedja "${store.chain}"`);
    const deals = (await source.fetchDeals(store)).filter((deal) => deal.name && deal.dealText);
    await replaceStoreDeals(store.id, deals);
    return { store: store.name, ok: true, count: deals.length };
  } catch (err) {
    const message = err.name === 'TimeoutError' ? 'tog för lång tid att svara' : err.message;
    await recordDealStoreError(store.id, message);
    console.warn(`Matschema: kunde inte hämta erbjudanden för ${store.name}: ${message}`);
    return { store: store.name, ok: false, error: message };
  }
}

// One refresh at a time; a second caller gets the run already in progress.
let running = null;

// Fetches enabled stores one after another (to be gentle on the chains'
// sites). With `onlyStale`, skips stores that were fetched recently.
function refreshDeals({ onlyStale = false } = {}) {
  if (!running) {
    running = (async () => {
      const stores = (await getDealStores()).filter((store) => store.enabled && (!onlyStale || isStale(store)));
      const results = [];
      for (const store of stores) {
        results.push(await refreshStore(store));
      }
      return results;
    })().finally(() => {
      running = null;
    });
  }
  return running;
}

// Keeps deals fresh while the app runs. Set DEALS_AUTO_REFRESH=false to
// turn it off (the admin's "Uppdatera nu" button still works).
function startDealsScheduler() {
  if (String(process.env.DEALS_AUTO_REFRESH || '').toLowerCase() === 'false') {
    return;
  }
  const check = () => refreshDeals({ onlyStale: true }).catch((err) => console.warn('Matschema: erbjudanden:', err.message));
  setTimeout(check, 15 * 1000).unref();
  setInterval(check, CHECK_EVERY_MS).unref();
}

module.exports = { isStale, refreshDeals, startDealsScheduler, SOURCES };
