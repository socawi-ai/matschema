const express = require('express');
const bcrypt = require('bcryptjs');

const {
  addMeal,
  deleteMealById,
  deleteScheduleById,
  getMeals,
  getSchedules,
  updateScheduleEntriesById,
  updateMealIngredients,
  upsertScheduleByWeekStart
} = require('../data/store');
const {
  generateRandomWeekSchedule,
  getISOWeekNumber,
  getISOWeekYear,
  startOfISOWeek,
  startOfWeek
} = require('../utils/scheduler');
const { updateUserEmail, updateUserPasswordHash } = require('../db');

const router = express.Router();

function renderBackend(req, res, options = {}) {
  const meals = getMeals();
  const schedules = getSchedules()
    .map((schedule) => ({
      ...schedule,
      weekNumber: schedule.weekNumber || getISOWeekNumber(schedule.weekStart)
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  const weekOptions = [];
  const baseMonday = startOfWeek(new Date());
  for (let i = 0; i < 16; i += 1) {
    const date = new Date(baseMonday.getFullYear(), baseMonday.getMonth(), baseMonday.getDate() + i * 7);
    const weekNumber = getISOWeekNumber(date);
    const year = getISOWeekYear(date);
    const weekKey = `${year}-${String(weekNumber).padStart(2, '0')}`;
    weekOptions.push({
      weekKey,
      label: `Vecka ${weekNumber} (${year})`
    });
  }

  return res.render('backend', {
    meals,
    schedules,
    weekOptions,
    selectedWeekKey: options.selectedWeekKey || weekOptions[0]?.weekKey || '',
    message: options.message || null,
    error: options.error || null,
    settingsMessage: options.settingsMessage || null,
    settingsError: options.settingsError || null
  });
}

router.get('/', (req, res) => renderBackend(req, res));

router.post('/meals', (req, res) => {
  const name = (req.body.name || '').trim();
  const rawIngredients = (req.body.ingredients || '').trim();
  const ingredients = rawIngredients
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!name) {
    res.status(400);
    return renderBackend(req, res, {
      error: 'Måltidsnamn måste fyllas i.'
    });
  }

  addMeal(name, ingredients);
  return res.redirect('/backend');
});

router.post('/meals/:mealId/ingredients', (req, res) => {
  const mealId = (req.params.mealId || '').trim();
  if (!mealId) {
    res.status(400);
    return renderBackend(req, res, {
      error: 'Saknar måltids-id.'
    });
  }

  const rawIngredients = (req.body.ingredients || '').trim();
  const ingredients = rawIngredients
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  updateMealIngredients(mealId, ingredients);
  return res.redirect('/backend');
});

router.post('/meals/:mealId/delete', (req, res) => {
  const mealId = (req.params.mealId || '').trim();
  if (!mealId) {
    res.status(400);
    return renderBackend(req, res, {
      error: 'Saknar måltids-id.'
    });
  }

  deleteMealById(mealId);
  return res.redirect('/backend');
});

router.post('/schedule/generate', (req, res) => {
  const meals = getMeals();
  if (!meals.length) {
    res.status(400);
    return renderBackend(req, res, {
      error: 'Lägg till minst en måltid innan du genererar ett schema.'
    });
  }

  const selectedWeekKey = (req.body.weekKey || '').trim();
  const parts = selectedWeekKey.split('-');
  if (parts.length !== 2) {
    res.status(400);
    return renderBackend(req, res, {
      error: 'Välj en giltig vecka.',
      selectedWeekKey
    });
  }

  const year = Number.parseInt(parts[0], 10);
  const weekNumber = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(year) || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53) {
    res.status(400);
    return renderBackend(req, res, {
      error: 'Välj en giltig vecka.',
      selectedWeekKey
    });
  }

  const firstWeekStart = startOfISOWeek(year, weekNumber);
  for (let i = 0; i < 3; i += 1) {
    const weekStart = new Date(
      firstWeekStart.getFullYear(),
      firstWeekStart.getMonth(),
      firstWeekStart.getDate() + i * 7
    );
    const schedule = generateRandomWeekSchedule(meals, weekStart);
    upsertScheduleByWeekStart(schedule);
  }

  return res.redirect('/backend');
});

router.post('/schedule/:scheduleId/update', (req, res) => {
  const scheduleId = (req.params.scheduleId || '').trim();
  if (!scheduleId) {
    res.status(400);
    return renderBackend(req, res, {
      error: 'Saknar schema-id.'
    });
  }

  const schedules = getSchedules();
  const schedule = schedules.find((item) => item.id === scheduleId);
  if (!schedule) {
    res.status(404);
    return renderBackend(req, res, {
      error: 'Schemat kunde inte hittas.'
    });
  }

  const meals = getMeals();
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
  const mealIdsInput = req.body.mealIds;
  const selectedMealIds = Array.isArray(mealIdsInput) ? mealIdsInput : [mealIdsInput];
  const customMealsInput = req.body.customMeals;
  const customMeals = Array.isArray(customMealsInput) ? customMealsInput : [customMealsInput];
  const randomIndexRaw = (req.body.randomIndex || '').trim();

  if (selectedMealIds.length !== schedule.entries.length || customMeals.length !== schedule.entries.length) {
    res.status(400);
    return renderBackend(req, res, {
      error: 'Ogiltig schemauppdatering. Försök igen.'
    });
  }

  const nextEntries = [];
  for (let i = 0; i < schedule.entries.length; i += 1) {
    const oldEntry = schedule.entries[i];
    const customMealName = (customMeals[i] || '').trim();

    if (randomIndexRaw !== '' && Number.parseInt(randomIndexRaw, 10) === i) {
      if (!meals.length) {
        res.status(400);
        return renderBackend(req, res, {
          error: 'Det finns inga måltider i databasen att slumpa från.'
        });
      }
      const randomMeal = meals[Math.floor(Math.random() * meals.length)];
      nextEntries.push({
        ...oldEntry,
        mealId: randomMeal.id,
        mealName: randomMeal.name
      });
      continue;
    }

    if (customMealName) {
      nextEntries.push({
        ...oldEntry,
        mealId: null,
        mealName: customMealName
      });
      continue;
    }

    const selectedMeal = mealsById.get((selectedMealIds[i] || '').trim());
    if (!selectedMeal) {
      res.status(400);
      return renderBackend(req, res, {
        error: 'Välj en giltig måltid eller ange en egen måltid för alla dagar.'
      });
    }

    nextEntries.push({
      ...oldEntry,
      mealId: selectedMeal.id,
      mealName: selectedMeal.name
    });
  }

  updateScheduleEntriesById(scheduleId, nextEntries);
  return res.redirect('/backend');
});

router.post('/schedule/delete', (req, res) => {
  const scheduleId = (req.body.scheduleId || '').trim();
  if (!scheduleId) {
    res.status(400);
    return renderBackend(req, res, {
      error: 'Saknar schema-id.'
    });
  }

  deleteScheduleById(scheduleId);
  return res.redirect('/backend');
});

router.post('/settings/email', async (req, res, next) => {
  try {
    const nextEmail = (req.body.email || '').trim().toLowerCase();
    const currentPassword = req.body.currentPassword || '';

    if (!nextEmail || !currentPassword) {
      return renderBackend(req, res, {
        settingsError: 'E-post och nuvarande lösenord måste fyllas i.'
      });
    }

    const ok = await bcrypt.compare(currentPassword, req.currentUser.password_hash);
    if (!ok) {
      return renderBackend(req, res, {
        settingsError: 'Nuvarande lösenord är felaktigt.'
      });
    }

    try {
      await updateUserEmail(req.currentUser.id, nextEmail);
      return renderBackend(req, res, {
        settingsMessage: 'E-postadressen har uppdaterats.'
      });
    } catch (err) {
      if (String(err.message).includes('UNIQUE constraint failed')) {
        return renderBackend(req, res, {
          settingsError: 'Den e-postadressen används redan.'
        });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
});

router.post('/settings/password', async (req, res, next) => {
  try {
    const currentPassword = req.body.currentPassword || '';
    const newPassword = req.body.newPassword || '';
    const confirmPassword = req.body.confirmPassword || '';

    if (!currentPassword || !newPassword || !confirmPassword) {
      return renderBackend(req, res, {
        settingsError: 'Nuvarande lösenord, nytt lösenord och bekräftelse måste fyllas i.'
      });
    }

    if (newPassword.length < 8) {
      return renderBackend(req, res, {
        settingsError: 'Nytt lösenord måste vara minst 8 tecken.'
      });
    }

    if (newPassword !== confirmPassword) {
      return renderBackend(req, res, {
        settingsError: 'Nytt lösenord och bekräftelse matchar inte.'
      });
    }

    const ok = await bcrypt.compare(currentPassword, req.currentUser.password_hash);
    if (!ok) {
      return renderBackend(req, res, {
        settingsError: 'Nuvarande lösenord är felaktigt.'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await updateUserPasswordHash(req.currentUser.id, passwordHash);

    return renderBackend(req, res, {
      settingsMessage: 'Lösenordet har uppdaterats.'
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
