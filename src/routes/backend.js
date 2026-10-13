const express = require('express');
const bcrypt = require('bcryptjs');

const {
  addMeal,
  deleteMealById,
  deleteScheduleById,
  getMeals,
  getRules,
  getSchedules,
  getSetting,
  removeSchedulesBeforeWeekStart,
  saveRules,
  updateMeal,
  updateScheduleEntry
} = require('../data/store');
const {
  getISOWeekNumber,
  mealsUsedNearWeek,
  pickRandomMealForDay,
  startOfWeek,
  toISODate
} = require('../utils/scheduler');
const { normalizeRules, parseDaysInput } = require('../utils/rules');
const { updateUsername, updateUserPasswordHash } = require('../db');
const { getDealStores, setCategoryOverride, setDealStoreEnabled } = require('../data/deals');
const { getDealsForDisplay } = require('../deals/display');
const { refreshDeals } = require('../deals');
const { EVERYDAY_CATEGORIES } = require('../deals/categories');
const { getDealPlanning, ingredientCategory } = require('../deals/meal-deals');
const { getCategoryOverrides } = require('../data/deals');
const { nameKey } = require('../data/deal-name');
const { version: appVersion } = require('../../package.json');
const { LIMITS, secret, text, textList } = require('../utils/input');
const { dayText, fillSchedule, periodLabel, shortDate } = require('../schedule/fill');

const router = express.Router();

// Generated days with no dish yet hold this name; the next "fill" replaces them.
const EMPTY_DAY_NAME = 'Rester';
// Leftovers chosen on purpose; kept as-is by the next "fill".
const LEFTOVERS_NAME = 'Rester/Matlåda';

// The admin page submits forms with fetch and then re-renders only the
// affected section, so a full-page error render would never be seen. Fetch
// requests get JSON instead, which the page shows as a toast.
function isFetchRequest(req) {
  return req.get('X-Requested-With') === 'fetch';
}

async function fail(req, res, status, error) {
  res.status(status);
  if (isFetchRequest(req)) {
    return res.json({ ok: false, error });
  }
  return renderBackend(req, res, { error });
}

function done(req, res, message) {
  if (isFetchRequest(req)) {
    return res.json({ ok: true, message: message || null });
  }
  return res.redirect('/backend');
}

function parseIngredients(raw) {
  return text(raw)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// The meal form has one "type" choice (regular/vegetarian/fish) plus a
// separate special toggle.
function tagsFromMealForm(body) {
  const type = ['vegetarian', 'fish'].includes(body.type) ? body.type : 'regular';
  return body.special === 'on' ? [type, 'special'] : [type];
}

async function getCurrentRules() {
  return normalizeRules(await getRules());
}

// "mån 13/10 kl. 18:07"
function whenText(iso) {
  const date = new Date(iso);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${dayText(date)} kl. ${time}`;
}

// Lines about the automatic weekly planning for the schedule tab, or null
// when it's off (see schedule/auto.js).
async function autoPlanStatus(rules) {
  if (!rules.autoPlan) return null;
  const state = (await getSetting('autoPlan')) || {};
  const lines = [];
  if (state.plannedAt && state.plannedError) {
    lines.push(`Automatisk planering ${whenText(state.plannedAt)} gick inte: ${state.plannedError}`);
  } else if (state.plannedAt) {
    const store = state.plannedStore ? ` med erbjudanden från ${state.plannedStore}` : '';
    lines.push(`Planerades automatiskt ${whenText(state.plannedAt)}${store}.`);
  }
  if (state.plannedWeek !== toISODate(startOfWeek(new Date()))) {
    lines.push('Planerar om måndag–torsdag när veckans erbjudanden har kommit, senast tisdag kl. 06.');
  }
  if (state.lockedAt) {
    const lastDay = new Date(new Date(`${state.lockedUntil}T00:00:00`).getTime() - 1);
    lines.push(`${state.lockedCount} dagar t.o.m. ${shortDate(lastDay)} markerades som handlade ${whenText(state.lockedAt)}.`);
  }
  return lines;
}

async function renderBackend(req, res, options = {}) {
  await removeSchedulesBeforeWeekStart(toISODate(startOfWeek(new Date())));

  const rules = await getCurrentRules();
  const overrides = await getCategoryOverrides();
  const meals = (await getMeals()).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  const planning = await getDealPlanning(meals, { shoppingStores: rules.shoppingStores, chosenStore: rules.shoppingStore });
  const mealsWithDeals = meals.map((meal) => ({
    ...meal,
    mainCategories: planning.mainByMealId.get(meal.id),
    ingredientCategories: (meal.ingredients || []).map((ingredient) => ({
      name: ingredient,
      category: ingredientCategory(ingredient, overrides),
      manual: overrides.has(nameKey(ingredient))
    }))
  }));
  // For the schedule: the deal period, the store to shop at (and how the
  // shopping stores compare), and each deal meal's deals at that store.
  const dealStores = await getDealStores();
  const storeName = (id) => (dealStores.find((s) => s.id === id) || {}).name || id;
  const dealPlanning = {
    active: rules.prioritizeDeals,
    from: toISODate(planning.period.start),
    to: toISODate(planning.period.end),
    periodLabel: periodLabel(planning.period),
    chosenStore: rules.shoppingStore,
    storeId: planning.storeId,
    storeName: planning.storeId ? storeName(planning.storeId) : null,
    storeRanking: planning.storeRanking.map((r) => ({ ...r, name: storeName(r.storeId) })),
    preferredMealIds: [...planning.preferredMealIds],
    dealsByMealId: Object.fromEntries(
      [...planning.dealsByMealId].map(([mealId, deals]) => [
        mealId,
        deals.map((deal) => ({
          name: deal.name,
          dealText: deal.dealText,
          storeName: deal.storeName,
          memberOnly: deal.memberOnly,
          validTo: deal.validTo
        }))
      ])
    )
  };
  const schedules = (await getSchedules())
    .map((schedule) => ({
      ...schedule,
      weekNumber: schedule.weekNumber || getISOWeekNumber(schedule.weekStart)
    }))
    .sort((a, b) => (a.weekStart > b.weekStart ? 1 : -1));

  return res.render('backend', {
    appVersion,
    meals: mealsWithDeals,
    rules,
    schedules,
    dealPlanning,
    autoPlanStatus: await autoPlanStatus(rules),
    dealStores,
    deals: await getDealsForDisplay(),
    everydayCategories: EVERYDAY_CATEGORIES,
    nextWeekStart: (() => {
      const monday = startOfWeek(new Date());
      return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
    })(),
    today: toISODate(new Date()),
    EMPTY_DAY_NAME,
    LEFTOVERS_NAME,
    error: options.error || null
  });
}

router.get('/', async (req, res) => renderBackend(req, res));

// --- Meals ---

function readMealForm(req) {
  const body = req.body || {};
  return {
    name: text(body.name),
    ingredients: parseIngredients(body.ingredients),
    tags: tagsFromMealForm(body)
  };
}

// An error message for an invalid meal form, or null.
function mealFormError({ name, ingredients }) {
  if (!name) return 'Måltidsnamn måste fyllas i.';
  if (name.length > LIMITS.name) return `Måltidsnamnet får vara högst ${LIMITS.name} tecken.`;
  if (ingredients.length > LIMITS.ingredients) return `Högst ${LIMITS.ingredients} ingredienser per måltid.`;
  if (ingredients.some((item) => item.length > LIMITS.ingredient)) {
    return `En ingrediens får vara högst ${LIMITS.ingredient} tecken.`;
  }
  return null;
}

router.post('/meals', async (req, res) => {
  const { name, ingredients, tags } = readMealForm(req);
  const error = mealFormError({ name, ingredients });
  if (error) {
    return fail(req, res, 400, error);
  }
  await addMeal(name, ingredients, tags);
  return done(req, res, `${name} har lagts till.`);
});

router.post('/meals/:mealId', async (req, res) => {
  const { name, ingredients, tags } = readMealForm(req);
  const error = mealFormError({ name, ingredients });
  if (error) {
    return fail(req, res, 400, error);
  }
  if (!(await updateMeal(req.params.mealId, { name, ingredients, tags }))) {
    return fail(req, res, 404, 'Måltiden kunde inte hittas. Ladda om sidan.');
  }
  return done(req, res, 'Måltiden har sparats.');
});

router.post('/meals/:mealId/delete', async (req, res) => {
  await deleteMealById(req.params.mealId);
  return done(req, res, 'Måltiden har tagits bort.');
});

// --- Schedule ---

// See fillSchedule; the messages and errors are shown as toasts.
async function fill(req, res, options) {
  const result = await fillSchedule(options);
  return result.ok ? done(req, res, result.message) : fail(req, res, 400, result.error);
}

router.post('/schedule/generate', async (req, res) => fill(req, res, { replan: false }));
// scope: 'generated' (default) keeps the user's own choices, 'all' re-plans every day in the period.
router.post('/schedule/replan', async (req, res) =>
  fill(req, res, { replan: true, scope: text((req.body || {}).scope) === 'all' ? 'all' : 'generated' })
);

// Changes a single day. `action` is one of:
//   pick      – a meal from the database (mealId)
//   custom    – a one-off meal by name (name)
//   leftovers – "Rester/Matlåda", kept by the next fill
//   clear     – empty the day so the next fill picks something
//   random    – a random meal that fits the day and the week
router.post('/schedule/:scheduleId/day/:index', async (req, res) => {
  const body = req.body || {};
  const index = Number.parseInt(req.params.index, 10);
  const meals = await getMeals();
  const rules = await getCurrentRules();
  const allSchedules = await getSchedules();
  let error = null;

  const entry = await updateScheduleEntry(req.params.scheduleId, index, (oldEntry, schedule) => {
    switch (body.action) {
      case 'pick': {
        const meal = meals.find((item) => item.id === body.mealId);
        if (!meal) {
          error = 'Måltiden finns inte längre. Ladda om sidan.';
          return null;
        }
        return { ...oldEntry, mealId: meal.id, mealName: meal.name, source: 'manual' };
      }
      case 'custom': {
        const name = text(body.name);
        if (!name || name.length > LIMITS.name) {
          error = name ? `Måltidsnamnet får vara högst ${LIMITS.name} tecken.` : 'Skriv ett namn på måltiden.';
          return null;
        }
        return { ...oldEntry, mealId: null, mealName: name, source: 'manual' };
      }
      case 'leftovers':
        return { ...oldEntry, mealId: null, mealName: LEFTOVERS_NAME, source: 'manual' };
      case 'clear':
        return { ...oldEntry, mealId: null, mealName: EMPTY_DAY_NAME, source: 'auto' };
      case 'random': {
        const near = mealsUsedNearWeek(allSchedules, schedule.weekStart);
        const meal = pickRandomMealForDay(meals, rules, schedule.entries, index, near);
        if (!meal) {
          error = 'Det finns ingen annan passande måltid som inte redan används den här veckan.';
          return null;
        }
        return { ...oldEntry, mealId: meal.id, mealName: meal.name, source: 'manual' };
      }
      default:
        error = 'Okänd ändring.';
        return null;
    }
  });

  if (!entry) {
    return fail(req, res, 400, error || 'Dagen kunde inte hittas. Ladda om sidan.');
  }
  return done(req, res);
});

router.post('/schedule/:scheduleId/delete', async (req, res) => {
  await deleteScheduleById(req.params.scheduleId);
  return done(req, res, 'Veckan har tagits bort.');
});

// --- Deals ---

router.post('/deals/refresh', async (req, res) => {
  const results = await refreshDeals();
  const failed = results.filter((result) => !result.ok);
  const count = results.reduce((sum, result) => sum + (result.count || 0), 0);
  if (failed.length === results.length && results.length) {
    return fail(req, res, 502, `Kunde inte hämta några erbjudanden: ${failed.map((f) => `${f.store} (${f.error})`).join(', ')}`);
  }
  const message = `Hämtade ${count} erbjudanden från ${results.length - failed.length} butiker.` +
    (failed.length ? ` Misslyckades: ${failed.map((f) => f.store).join(', ')}.` : '');
  return done(req, res, message);
});

// Moves a product (by name, in every store and future week) to an everyday
// category, marks it as not everyday ('none'), or back to automatic ('').
router.post('/deals/category', async (req, res) => {
  const body = req.body || {};
  const name = text(body.name);
  const category = text(body.category);
  const target = EVERYDAY_CATEGORIES.find((c) => c.id === category);
  if (!name || name.length > LIMITS.productName) {
    return fail(req, res, 400, 'Saknar varunamn.');
  }
  if (category && category !== 'none' && !target) {
    return fail(req, res, 400, 'Okänd kategori.');
  }

  await setCategoryOverride(name, category || null);
  const message = !category
    ? `${name} sorteras automatiskt igen.`
    : category === 'none'
      ? `${name} räknas inte längre som vardagsvara.`
      : `${name} flyttad till ${target.label}.`;
  return done(req, res, message);
});

router.post('/deals/stores/:storeId', async (req, res) => {
  const enabled = (req.body || {}).enabled === 'on';
  if (!(await setDealStoreEnabled(req.params.storeId, enabled))) {
    return fail(req, res, 404, 'Butiken kunde inte hittas.');
  }
  return done(req, res);
});

// --- Settings ---

router.post('/rules', async (req, res) => {
  const body = req.body || {};
  // Only stores that exist; anything else in the form is ignored.
  const knownStoreIds = new Set((await getDealStores()).map((store) => store.id));
  const shoppingStores = textList(body.shoppingStores).filter((id) => knownStoreIds.has(id));
  // Merged into the saved rules, so settings that live elsewhere (the store
  // chosen in the schedule tab) are kept.
  const rules = normalizeRules({
    ...(await getCurrentRules()),
    shoppingStores,
    planningHorizonWeeks: body.planningHorizonWeeks,
    fishMealsPerWeek: body.fishMealsPerWeek,
    vegetarianMealsPerWeek: body.vegetarianMealsPerWeek,
    specialDays: parseDaysInput(body.specialDays),
    vegetarianAllowedDays: parseDaysInput(body.vegetarianAllowedDays),
    sameSpecialAcrossSpecialDays: body.sameSpecialAcrossSpecialDays === 'on',
    prioritizeDeals: body.prioritizeDeals === 'on',
    autoPlan: body.autoPlan === 'on'
  });

  await saveRules(rules);
  return done(req, res);
});

// The store to shop at for the deal period: a shopping store id, or 'auto'.
router.post('/schedule/store', async (req, res) => {
  const store = text((req.body || {}).store) || 'auto';
  const rules = await getCurrentRules();
  if (store !== 'auto' && !rules.shoppingStores.includes(store)) {
    return fail(req, res, 400, 'Butiken finns inte bland butikerna du storhandlar i.');
  }
  await saveRules({ ...rules, shoppingStore: store });
  return done(req, res);
});

router.post('/settings/username', async (req, res) => {
  const body = req.body || {};
  const nextUsername = text(body.username).toLowerCase();
  const currentPassword = secret(body.currentPassword);

  if (!nextUsername || !currentPassword) {
    return fail(req, res, 400, 'Användarnamn och nuvarande lösenord måste fyllas i.');
  }
  if (nextUsername.length > LIMITS.username) {
    return fail(req, res, 400, `Användarnamnet får vara högst ${LIMITS.username} tecken.`);
  }

  const ok = await bcrypt.compare(currentPassword, req.currentUser.password_hash);
  if (!ok) {
    return fail(req, res, 400, 'Nuvarande lösenord är felaktigt.');
  }

  try {
    await updateUsername(req.currentUser.id, nextUsername);
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return fail(req, res, 400, 'Användarnamnet används redan.');
    }
    throw err;
  }
  return done(req, res, 'Användarnamnet har uppdaterats.');
});

router.post('/settings/password', async (req, res) => {
  const body = req.body || {};
  const currentPassword = secret(body.currentPassword);
  const newPassword = secret(body.newPassword);
  const confirmPassword = secret(body.confirmPassword);

  if (!currentPassword || !newPassword || !confirmPassword) {
    return fail(req, res, 400, 'Nuvarande lösenord, nytt lösenord och bekräftelse måste fyllas i.');
  }
  if (newPassword.length < 8 || newPassword.length > LIMITS.password) {
    return fail(req, res, 400, `Nytt lösenord måste vara 8–${LIMITS.password} tecken.`);
  }
  if (newPassword !== confirmPassword) {
    return fail(req, res, 400, 'Nytt lösenord och bekräftelse matchar inte.');
  }

  const ok = await bcrypt.compare(currentPassword, req.currentUser.password_hash);
  if (!ok) {
    return fail(req, res, 400, 'Nuvarande lösenord är felaktigt.');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await updateUserPasswordHash(req.currentUser.id, passwordHash);
  return done(req, res, 'Lösenordet har uppdaterats.');
});

module.exports = router;
