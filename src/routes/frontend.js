const express = require('express');

const { getMeals, getSchedules } = require('../data/store');
const { buildThreeWeekView, toISODate } = require('../utils/scheduler');
const { version: appVersion } = require('../../package.json');

const router = express.Router();

// The three weeks shown publicly, plus the details of each planned meal
// (type and ingredients) keyed by id for the ingredients dialog.
async function getFrontendData() {
  const weeks = buildThreeWeekView(await getSchedules(), new Date());
  const meals = await getMeals();
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));

  const plannedMeals = {};
  const weeksWithMeals = weeks.map((week) => ({
    ...week,
    entries: week.entries.map((entry) => {
      const meal = entry.mealId ? mealsById.get(entry.mealId) : null;
      if (meal) {
        plannedMeals[meal.id] = { name: meal.name, ingredients: meal.ingredients };
      }
      return {
        ...entry,
        isSpecial: Boolean(meal && meal.special),
        isVegetarian: Boolean(meal && meal.tags.includes('vegetarian')),
        isFish: Boolean(meal && meal.tags.includes('fish')),
        hasIngredients: Boolean(meal && meal.ingredients.length)
      };
    })
  }));

  return { weeks: weeksWithMeals, plannedMeals, today: toISODate(new Date()), appVersion };
}

router.get('/', async (req, res) => {
  res.render('frontend', await getFrontendData());
});

router.get('/ha', async (req, res) => {
  res.render('frontend-ha', await getFrontendData());
});

module.exports = router;
