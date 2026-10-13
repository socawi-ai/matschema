const express = require('express');

const { getMeals, getSchedules } = require('../data/store');
const { getPublicShopping } = require('../deals/shopping');
const { buildThreeWeekView, toISODate } = require('../utils/scheduler');
const { version: appVersion } = require('../../package.json');

const router = express.Router();

// The three weeks shown publicly, plus the details of each planned meal
// (type, ingredients and offers) keyed by id for the ingredients dialog,
// and the shopping list (see getPublicShopping). Settings stay in the admin.
async function getFrontendData() {
  const now = new Date();
  const weeks = buildThreeWeekView(await getSchedules(), now);
  const shopping = await getPublicShopping(now);
  // 🏷 on days in the shopping list whose meal has an offer.
  const dealsFor = (entry) =>
    shopping && entry.mealId && entry.date >= shopping.from && entry.date < shopping.to
      ? shopping.mealDeals.get(entry.mealId) || null
      : null;
  const meals = await getMeals();
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));

  const plannedMeals = {};
  const weeksWithMeals = weeks.map((week) => ({
    ...week,
    entries: week.entries.map((entry) => {
      const meal = entry.mealId ? mealsById.get(entry.mealId) : null;
      const deals = meal ? dealsFor(entry) : null;
      if (meal) {
        plannedMeals[meal.id] = {
          name: meal.name,
          ingredients: meal.ingredients,
          deals: deals || (plannedMeals[meal.id] && plannedMeals[meal.id].deals) || []
        };
      }
      return {
        ...entry,
        isSpecial: Boolean(meal && meal.special),
        isVegetarian: Boolean(meal && meal.tags.includes('vegetarian')),
        isFish: Boolean(meal && meal.tags.includes('fish')),
        isDeal: Boolean(deals),
        hasIngredients: Boolean(meal && meal.ingredients.length)
      };
    })
  }));

  return {
    weeks: weeksWithMeals,
    plannedMeals,
    shopping,
    today: toISODate(now),
    appVersion
  };
}

router.get('/', async (req, res) => {
  res.render('frontend', await getFrontendData());
});

// Preview of a new, more designed public page; same data as '/'.
router.get('/ny', async (req, res) => {
  res.render('frontend-ny', await getFrontendData());
});

router.get('/ha', async (req, res) => {
  res.render('frontend-ha', await getFrontendData());
});

module.exports = router;
