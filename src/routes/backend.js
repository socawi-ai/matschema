const express = require('express');
const bcrypt = require('bcryptjs');

const {
  addMeal,
  deleteMealById,
  deleteScheduleById,
  getMeals,
  getRules,
  getSchedules,
  removeSchedulesBeforeWeekStart,
  saveRules,
  updateMeal,
  updateScheduleEntry,
  updateSchedules
} = require('../data/store');
const {
  clearForReplan,
  generateWeeks,
  getISOWeekNumber,
  mealCategory,
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

// Short Swedish date for messages: 2026-10-11 -> "11/10".
const shortDate = (date) => `${date.getDate()}/${date.getMonth() + 1}`;

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
    periodLabel: `${shortDate(planning.period.start)}–${shortDate(new Date(planning.period.end.getTime() - 1))}`,
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

// Fills the planning horizon. With `replan`, days in the deal period are
// emptied first so they're planned again with the current deals: only
// generated ('auto') days with scope 'generated', every day with scope 'all'
// (see clearForReplan). Meals whose main ingredient is on offer are picked
// first in the deal period (see generateWeekSchedule), unless that's turned
// off in the rules.
async function fillSchedule(req, res, { replan, scope = 'generated' }) {
  const meals = await getMeals();
  if (!meals.length) {
    return fail(req, res, 400, 'Lägg till minst en måltid innan du fyller schemat.');
  }

  const rules = await getCurrentRules();

  // Only require the meal types the current rules actually ask for.
  // Special meals only count for special days (see generateWeekSchedule).
  const hasCategory = (category) => meals.some((meal) => mealCategory(meal) === category);
  const hasNonSpecial = meals.some((meal) => mealCategory(meal) !== 'special');

  if (rules.fishMealsPerWeek > 0 && !hasCategory('fish')) {
    return fail(req, res, 400, 'Reglerna kräver fisk, men det finns ingen fiskmåltid (utan ⭐) i databasen.');
  }
  if (rules.vegetarianMealsPerWeek > 0 && !hasCategory('vegetarian')) {
    return fail(req, res, 400, 'Reglerna kräver vegetariskt, men det finns ingen vegetarisk måltid (utan ⭐) i databasen.');
  }
  if (rules.specialDays.length > 0 && !hasCategory('special')) {
    return fail(req, res, 400, 'Det finns specialdagar i reglerna men ingen specialmåltid i databasen.');
  }
  if (rules.specialDays.length < 7 && !hasNonSpecial) {
    return fail(req, res, 400, 'Det krävs minst en vanlig (icke-special) måltid för övriga dagar.');
  }

  const planning = await getDealPlanning(meals, { shoppingStores: rules.shoppingStores, chosenStore: rules.shoppingStore });
  const from = toISODate(planning.period.start);
  const to = toISODate(planning.period.end);
  const preference = rules.prioritizeDeals && planning.preferredMealIds.size
    ? { mealIds: planning.preferredMealIds, from, to }
    : null;

  const firstWeekStart = startOfWeek(new Date());
  const weekStarts = Array.from({ length: rules.planningHorizonWeeks }, (_, i) =>
    new Date(firstWeekStart.getFullYear(), firstWeekStart.getMonth(), firstWeekStart.getDate() + i * 7)
  );

  // Read, plan and save in one transaction, so a day changed meanwhile isn't
  // overwritten (see updateSchedules).
  await updateSchedules((existingSchedules) => {
    // Emptied days don't count as nearby meals for the other weeks either.
    const weeks = existingSchedules.map((schedule) => ({ weekStart: schedule.weekStart, entries: schedule.entries }));
    const knownWeeks = replan ? clearForReplan(weeks, { from, to }, scope) : weeks;
    return generateWeeks(meals, rules, weekStarts, knownWeeks, preference).map((schedule) => {
      const existingSchedule = existingSchedules.find((item) => item.weekStart === schedule.weekStart);
      return existingSchedule ? { ...schedule, id: existingSchedule.id, createdAt: existingSchedule.createdAt } : schedule;
    });
  });

  const periodText = `${shortDate(planning.period.start)}–${shortDate(new Date(planning.period.end.getTime() - 1))}`;
  const store = (await getDealStores()).find((s) => s.id === planning.storeId);
  const storeText = preference && store ? ` med erbjudanden från ${store.name}` : '';
  if (replan && scope === 'all') {
    return done(req, res, `Hela perioden ${periodText} är planerad om${storeText}.`);
  }
  if (replan) {
    return done(req, res, `Genererade dagar ${periodText} är planerade om${storeText}. Dina egna val behölls.`);
  }
  return done(req, res, preference ? `Tomma dagar har fyllts. Rätter${storeText} prioriterades ${periodText}.` : 'Tomma dagar har fyllts.');
}

router.post('/schedule/generate', async (req, res) => fillSchedule(req, res, { replan: false }));
// scope: 'generated' (default) keeps the user's own choices, 'all' re-plans every day in the period.
router.post('/schedule/replan', async (req, res) =>
  fillSchedule(req, res, { replan: true, scope: text((req.body || {}).scope) === 'all' ? 'all' : 'generated' })
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
    prioritizeDeals: body.prioritizeDeals === 'on'
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
