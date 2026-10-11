const { getDb } = require('../db');
const { inTransaction } = require('../db/transaction');
const { startOfWeek } = require('../utils/scheduler');
const { nameKey } = require('./deal-name');

function storeFromRow(row) {
  return { ...row, enabled: Boolean(row.enabled) };
}

function dealFromRow(row) {
  return {
    storeId: row.store_id,
    storeName: row.store_name,
    chain: row.chain,
    externalId: row.external_id,
    name: row.name,
    brand: row.brand,
    size: row.size,
    dealText: row.deal_text,
    price: row.price,
    regularPrice: row.regular_price,
    comparePrice: row.compare_price,
    memberOnly: Boolean(row.member_only),
    limitText: row.limit_text,
    category: row.category,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    imageUrl: row.image_url,
    url: row.url,
    firstSeenAt: row.first_seen_at || null
  };
}

async function getDealStores() {
  const db = await getDb();
  return (await db.all('SELECT * FROM deal_stores ORDER BY sort_order, name')).map(storeFromRow);
}

async function setDealStoreEnabled(storeId, enabled) {
  return inTransaction(async (db) => {
    const result = await db.run('UPDATE deal_stores SET enabled = ? WHERE id = ?', enabled ? 1 : 0, storeId);
    return result.changes > 0;
  });
}

// Replaces everything stored for one store with a fresh fetch. Only called
// after a successful fetch, so a failing source keeps its previous deals.
async function replaceStoreDeals(storeId, deals) {
  const now = new Date().toISOString();
  await inTransaction(async (db) => {
    await db.run('DELETE FROM deals WHERE store_id = ?', storeId);
    for (const deal of deals) {
      await db.run(
        `INSERT OR REPLACE INTO deals (store_id, external_id, name, brand, size, deal_text, price, regular_price,
           compare_price, member_only, limit_text, category, valid_from, valid_to, image_url, url, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        storeId,
        deal.externalId,
        deal.name,
        deal.brand,
        deal.size,
        deal.dealText,
        deal.price,
        deal.regularPrice,
        deal.comparePrice,
        deal.memberOnly ? 1 : 0,
        deal.limitText,
        deal.category,
        deal.validFrom,
        deal.validTo,
        deal.imageUrl,
        deal.url,
        now
      );
      await db.run('INSERT OR IGNORE INTO deal_names (name_key, first_seen_at) VALUES (?, ?)', nameKey(deal.name), now);
    }
    await db.run(
      `UPDATE deal_stores SET last_attempt_at = ?, last_success_at = ?, last_error = NULL, deal_count = ?
       WHERE id = ?`,
      now,
      now,
      deals.length,
      storeId
    );
  });
}

async function recordDealStoreError(storeId, message) {
  await inTransaction((db) =>
    db.run(
      'UPDATE deal_stores SET last_attempt_at = ?, last_error = ? WHERE id = ?',
      new Date().toISOString(),
      String(message).slice(0, 500),
      storeId
    )
  );
}

// Deals from enabled stores that haven't ended yet and start no later than
// the end of next week (e.g. Lidl publishes next week's offers early).
// Ordered by store, then by name.
async function getCurrentDeals(now = new Date()) {
  const db = await getDb();
  const nowIso = now.toISOString();
  const thisMonday = startOfWeek(now);
  const weekAheadIso = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + 14).toISOString();
  const rows = await db.all(
    `SELECT deals.*, deal_stores.name AS store_name, deal_stores.chain AS chain, deal_stores.sort_order AS store_order
     FROM deals JOIN deal_stores ON deal_stores.id = deals.store_id
     WHERE deal_stores.enabled = 1
       AND (deals.valid_to IS NULL OR deals.valid_to >= ?)
       AND (deals.valid_from IS NULL OR deals.valid_from <= ?)`,
    nowIso,
    weekAheadIso
  );
  // Names are sorted here rather than in SQL: SQLite's NOCASE only folds
  // ASCII, so å/ä/ö would end up in the wrong place. The same goes for
  // matching on name_key, hence the lookup in JS.
  rows.sort((a, b) => a.store_order - b.store_order || a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' }));
  const firstSeen = new Map(
    (await db.all('SELECT name_key, first_seen_at FROM deal_names')).map((r) => [r.name_key, r.first_seen_at])
  );
  return rows.map((row) => dealFromRow({ ...row, first_seen_at: firstSeen.get(nameKey(row.name)) }));
}

// Manual category corrections, keyed by product name (see nameKey).
// Values are an everyday category id, or 'none' for "not an everyday item".
async function getCategoryOverrides() {
  const db = await getDb();
  const rows = await db.all('SELECT name_key, category FROM deal_category_overrides');
  return new Map(rows.map((r) => [r.name_key, r.category]));
}

// Sets the category for every deal with this product name, in all stores
// and future weeks. `category` null removes the correction.
async function setCategoryOverride(name, category) {
  const key = nameKey(name);
  await inTransaction((db) =>
    category === null
      ? db.run('DELETE FROM deal_category_overrides WHERE name_key = ?', key)
      : db.run(
          `INSERT INTO deal_category_overrides (name_key, category, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(name_key) DO UPDATE SET category = excluded.category, updated_at = excluded.updated_at`,
          key,
          category,
          new Date().toISOString()
        )
  );
}

module.exports = {
  getCategoryOverrides,
  getCurrentDeals,
  getDealStores,
  recordDealStoreError,
  replaceStoreDeals,
  setCategoryOverride,
  setDealStoreEnabled
};
