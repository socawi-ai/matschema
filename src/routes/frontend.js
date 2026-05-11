const express = require('express');

const { getMeals, getSchedules } = require('../data/store');
const { buildThreeWeekView } = require('../utils/scheduler');

const router = express.Router();

router.get('/', (req, res) => {
  const schedules = getSchedules();
  const weeks = buildThreeWeekView(schedules, new Date());
  const meals = getMeals();
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));

  const weeksWithIngredients = weeks.map((week) => ({
    ...week,
    entries: week.entries.map((entry) => {
      const meal = entry.mealId ? mealsById.get(entry.mealId) : null;
      return {
        ...entry,
        ingredients: meal && Array.isArray(meal.ingredients) ? meal.ingredients : []
      };
    })
  }));

  res.render('frontend', {
    weeks: weeksWithIngredients
  });
});

module.exports = router;
