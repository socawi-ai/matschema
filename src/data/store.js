const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const mealsPath = path.join(dataDir, 'meals.json');
const schedulesPath = path.join(dataDir, 'schedules.json');

function ensureDataFiles() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(mealsPath)) {
    fs.writeFileSync(mealsPath, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(schedulesPath)) {
    fs.writeFileSync(schedulesPath, JSON.stringify([], null, 2));
  }
}

function readJson(filePath) {
  ensureDataFiles();
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, value) {
  ensureDataFiles();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function normalizeMeal(meal) {
  const allowedTags = new Set(['regular', 'vegetarian', 'fish', 'special']);
  let tags = Array.isArray(meal.tags) ? meal.tags.filter((tag) => allowedTags.has(tag)) : [];

  // Backwards compatibility from legacy model.
  if (!tags.length) {
    if (meal.tag && allowedTags.has(meal.tag)) {
      tags.push(meal.tag);
    }
    if (meal.special) {
      tags.push('special');
    }
  }

  const hasDietTag = tags.includes('vegetarian') || tags.includes('fish');
  if (!hasDietTag) {
    tags.push('regular');
  }

  tags = [...new Set(tags)];
  const primaryTag = tags.includes('vegetarian') ? 'vegetarian' : tags.includes('fish') ? 'fish' : 'regular';

  return {
    ...meal,
    ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
    tags,
    tag: primaryTag,
    special: tags.includes('special')
  };
}

function getMeals() {
  const meals = readJson(mealsPath);
  return meals.map(normalizeMeal);
}

function addMeal(name, ingredients = [], tags = ['regular']) {
  const meals = getMeals();
  const meal = normalizeMeal({
    id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name,
    ingredients,
    tags
  });
  meals.push(meal);
  writeJson(mealsPath, meals);
  return meal;
}

function updateMealIngredients(mealId, ingredients = []) {
  const meals = getMeals();
  const nextMeals = meals.map((meal) => {
    if (meal.id !== mealId) {
      return meal;
    }
    return {
      ...meal,
      ingredients
    };
  });
  writeJson(mealsPath, nextMeals);
}

function updateMealMeta(mealId, { tags }) {
  const meals = getMeals();
  const nextMeals = meals.map((meal) => {
    if (meal.id !== mealId) {
      return meal;
    }
    return normalizeMeal({
      ...meal,
      tags
    });
  });
  writeJson(mealsPath, nextMeals);
}

function deleteMealById(mealId) {
  const meals = getMeals();
  const nextMeals = meals.filter((meal) => meal.id !== mealId);
  writeJson(mealsPath, nextMeals);
}

function getSchedules() {
  return readJson(schedulesPath);
}

function saveSchedule(schedule) {
  const schedules = getSchedules();
  schedules.push(schedule);
  writeJson(schedulesPath, schedules);
}

function upsertScheduleByWeekStart(schedule) {
  const schedules = getSchedules();
  const nextSchedules = schedules.filter((item) => item.weekStart !== schedule.weekStart);
  nextSchedules.push(schedule);
  writeJson(schedulesPath, nextSchedules);
}

function deleteScheduleById(scheduleId) {
  const schedules = getSchedules();
  const nextSchedules = schedules.filter((schedule) => schedule.id !== scheduleId);
  writeJson(schedulesPath, nextSchedules);
}

function removeSchedulesBeforeWeekStart(weekStartIso) {
  const schedules = getSchedules();
  const nextSchedules = schedules.filter((schedule) => {
    if (!schedule.weekStart) return false;
    return schedule.weekStart >= weekStartIso;
  });
  writeJson(schedulesPath, nextSchedules);
}

function updateScheduleEntriesById(scheduleId, entries) {
  const schedules = getSchedules();
  const nextSchedules = schedules.map((schedule) => {
    if (schedule.id !== scheduleId) {
      return schedule;
    }
    return {
      ...schedule,
      entries
    };
  });
  writeJson(schedulesPath, nextSchedules);
}

module.exports = {
  addMeal,
  deleteScheduleById,
  deleteMealById,
  removeSchedulesBeforeWeekStart,
  getMeals,
  getSchedules,
  saveSchedule,
  updateScheduleEntriesById,
  updateMealMeta,
  updateMealIngredients,
  upsertScheduleByWeekStart
};
