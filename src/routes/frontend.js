const express = require('express');

const { getMeals, getSchedules } = require('../data/store');
const { buildThreeWeekView } = require('../utils/scheduler');

const router = express.Router();

router.get('/', (req, res) => {
  const offsetWeeks = Number.parseInt(req.query.offset || '0', 10);
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + offsetWeeks * 7);

  const schedules = getSchedules();
  const weeks = buildThreeWeekView(schedules, baseDate);
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
    weeks: weeksWithIngredients,
    offsetWeeks
  });
});

module.exports = router;
