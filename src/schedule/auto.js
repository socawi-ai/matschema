// Automatic weekly planning (the rule `autoPlan`), for a household that gets
// new offers on Monday, does the big shop on one of Tuesday–Thursday and
// buys for the deal period (Friday through Sunday two weeks ahead):
//
//   Monday–Thursday, once this week's offers are in (by Tuesday 06:00 at the
//   latest), the generated days in the deal period are planned again with
//   the store that has offers for the most meals ("Planera om med
//   erbjudanden", generated days only). Once per week.
//
//   From Friday 00:00 the shop is assumed done: the generated days that week's
//   deal period covers are locked as bought (see lockBoughtDays), so the
//   next Monday doesn't replace food that's already in the fridge. A missed
//   Friday (the server was down) is caught up before the next planning.
//
// What has been done is kept in the settings row 'autoPlan':
//   { lockedWeek, lockedAt, lockedUntil, lockedCount,
//     plannedWeek, plannedAt, plannedStore, plannedError }
// where the *Week values are the Monday ('YYYY-MM-DD') of the week it was for.

const { getCurrentDeals, getDealStores } = require('../data/deals');
const { getRules, getSetting, saveSetting, updateSchedules } = require('../data/store');
const { lockBoughtDays, startOfWeek, toISODate } = require('../utils/scheduler');
const { normalizeRules } = require('../utils/rules');
const { fillSchedule } = require('./fill');

const CHECK_EVERY_MS = 15 * 60 * 1000;
// Plan with whatever offers there are from this time on Tuesday.
const FALLBACK_HOUR = 6;

const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// The locking due at `now`, or null: the days bought for in the week of the
// last Friday 00:00 that has passed, unless that week is already locked.
// Returns { week, until } ('YYYY-MM-DD'; until = the end of that week's
// deal period, exclusive).
function lockDue(now, state = {}) {
  const monday = startOfWeek(now);
  const weekStart = now >= addDays(monday, 4) ? monday : addDays(monday, -7);
  const week = toISODate(weekStart);
  if (state.lockedWeek && state.lockedWeek >= week) return null;
  return { week, until: toISODate(addDays(weekStart, 21)) };
}

// Whether this week's offers seem to be in: every shopping store has been
// fetched since Monday 00:00, and at least one of their deals is new since
// last Friday (next week's offers often show up over the weekend). New means
// a product name not seen before, or a deal valid from that Friday on.
function offersArrived(now, stores, deals, shoppingStores) {
  const monday = startOfWeek(now);
  const since = addDays(monday, -3);
  const shopping = stores.filter((store) => store.enabled && shoppingStores.includes(store.id));
  if (!shopping.length) return false;
  const fetched = shopping.every((store) => store.last_success_at && Date.parse(store.last_success_at) >= monday.getTime());
  const isNew = (deal) =>
    (deal.firstSeenAt && Date.parse(deal.firstSeenAt) >= since.getTime()) ||
    (deal.validFrom && Date.parse(deal.validFrom) >= since.getTime());
  return fetched && deals.some((deal) => shoppingStores.includes(deal.storeId) && isNew(deal));
}

// Whether to plan now: Monday–Thursday, not yet this week, and the offers
// are in or it's Tuesday FALLBACK_HOUR or later.
function planDue(now, state = {}, offersIn = false) {
  const day = now.getDay();
  if (day < 1 || day > 4) return false;
  if (state.plannedWeek === toISODate(startOfWeek(now))) return false;
  const fallback = new Date(addDays(startOfWeek(now), 1).setHours(FALLBACK_HOUR));
  return offersIn || now >= fallback;
}

// Does whatever is due at `now`. Returns the new state, or null when
// automatic planning is off.
async function runAutoPlan(now = new Date()) {
  const rules = normalizeRules(await getRules());
  if (!rules.autoPlan) return null;
  let state = (await getSetting('autoPlan')) || {};

  const lock = lockDue(now, state);
  if (lock) {
    let lockedCount = 0;
    await updateSchedules((schedules) => {
      const locked = lockBoughtDays(schedules, lock.until);
      lockedCount = locked.flatMap((s) => s.entries).filter((e) => e.source === 'bought').length -
        schedules.flatMap((s) => s.entries).filter((e) => e.source === 'bought').length;
      return locked;
    });
    state = { ...state, lockedWeek: lock.week, lockedAt: now.toISOString(), lockedUntil: lock.until, lockedCount };
    await saveSetting('autoPlan', state);
    console.log(`Matschema: ${lockedCount} dagar t.o.m. ${lock.until} markerade som handlade.`);
  }

  if (planDue(now, state, offersArrived(now, await getDealStores(), await getCurrentDeals(now), rules.shoppingStores))) {
    const result = await fillSchedule({ replan: true, scope: 'generated', chosenStore: 'auto', now });
    state = {
      ...state,
      plannedWeek: toISODate(startOfWeek(now)),
      plannedAt: now.toISOString(),
      plannedStore: result.ok ? result.storeName : null,
      plannedError: result.ok ? null : result.error
    };
    await saveSetting('autoPlan', state);
    console.log(`Matschema: automatisk planering: ${result.ok ? result.message : result.error}`);
  }
  return state;
}

// Checks every CHECK_EVERY_MS while the app runs; does nothing unless
// `autoPlan` is on in the rules.
function startAutoPlanner() {
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      await runAutoPlan();
    } catch (err) {
      console.warn('Matschema: automatisk planering:', err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(check, 60 * 1000).unref();
  setInterval(check, CHECK_EVERY_MS).unref();
}

module.exports = { lockDue, offersArrived, planDue, runAutoPlan, startAutoPlanner };
