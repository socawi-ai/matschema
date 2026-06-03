const express = require('express');
const bcrypt = require('bcryptjs');

const {
  addMeal,
  deleteMealById,
  deleteScheduleById,
  getMeals,
  getSchedules,
  removeSchedulesBeforeWeekStart,
  updateScheduleEntriesById,
  updateMealMeta,
  updateMealIngredients,
  upsertScheduleByWeekStart
} = require('../data/store');
const {
  generateRandomWeekSchedule,
  DAYS,
  getISOWeekNumber,
  startOfWeek
} = require('../utils/scheduler');
const {
  getRulesByUserId,
  upsertRulesByUserId,
  updateUsername,
  updateUserPasswordHash
} = require('../db');

const router = express.Router();

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

const DEFAULT_RULES = {
  planningHorizonWeeks: 3,
  fishMealsPerWeek: 1,
  vegetarianMealsPerWeek: 1,
  specialDays: ['Fredag', 'Lördag'],
  sameSpecialAcrossSpecialDays: true,
  vegetarianAllowedDays: ['Måndag', 'Onsdag', 'Torsdag', 'Söndag']
};

function parseDaysInput(value) {
  if (Array.isArray(value)) {
    return value
      .map((day) => String(day || '').trim())
      .filter((day) => day && DAYS.includes(day));
  }

  return String(value || '')
    .split(/\r?\n|,/)
    .map((day) => day.trim())
    .filter((day) => day && DAYS.includes(day));
}

function normalizeRules(rawRules) {
  const rules = { ...DEFAULT_RULES, ...(rawRules || {}) };
  rules.planningHorizonWeeks = Number.parseInt(rules.planningHorizonWeeks, 10) || 3;
  rules.fishMealsPerWeek = Number.parseInt(rules.fishMealsPerWeek, 10) || 1;
  rules.vegetarianMealsPerWeek = Number.parseInt(rules.vegetarianMealsPerWeek, 10) || 1;
  rules.specialDays = Array.isArray(rules.specialDays) ? rules.specialDays.filter((d) => DAYS.includes(d)) : [...DEFAULT_RULES.specialDays];
  rules.vegetarianAllowedDays = Array.isArray(rules.vegetarianAllowedDays)
    ? rules.vegetarianAllowedDays.filter((d) => DAYS.includes(d))
    : [...DEFAULT_RULES.vegetarianAllowedDays];
  rules.sameSpecialAcrossSpecialDays = Boolean(rules.sameSpecialAcrossSpecialDays);
  return rules;
}

function tagFromCheckboxes(body) {
  const tags = [];
  const isVegetarian = body.isVegetarian === 'on';
  const isFish = body.isFish === 'on';
  const isSpecial = body.special === 'on';

  if (isVegetarian) {
    tags.push('vegetarian');
  } else if (isFish) {
    tags.push('fish');
  } else {
    tags.push('regular');
  }

  if (isSpecial) {
    tags.push('special');
  }

  return tags;
}

async function renderBackend(req, res, options = {}) {
  const currentWeekStartIso = startOfWeek(new Date()).toISOString().slice(0, 10);
  removeSchedulesBeforeWeekStart(currentWeekStartIso);

  const meals = getMeals();
  const regularMeals = meals.filter((meal) => !meal.special);
  const specialMeals = meals.filter((meal) => meal.special);
  const schedules = getSchedules()
    .map((schedule) => ({
      ...schedule,
      weekNumber: schedule.weekNumber || getISOWeekNumber(schedule.weekStart)
    }))
    .sort((a, b) => (a.weekStart > b.weekStart ? 1 : -1));
  const persistedRules = req.currentUser ? await getRulesByUserId(req.currentUser.id) : null;
  const rules = normalizeRules(persistedRules);

  return res.render('backend', {
    meals,
    regularMeals,
    rules,
    schedules,
    specialMeals,
    message: options.message || null,
    error: options.error || null,
    settingsMessage: options.settingsMessage || null,
    settingsError: options.settingsError || null
  });
}

router.get('/', async (req, res) => renderBackend(req, res));

router.post('/meals', async (req, res) => {
  const name = (req.body.name || '').trim();
  const tags = tagFromCheckboxes(req.body);
  const rawIngredients = (req.body.ingredients || '').trim();
  const ingredients = rawIngredients
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!name) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Måltidsnamn måste fyllas i.'
    });
  }

  addMeal(name, ingredients, tags);
  return res.redirect('/backend');
});

router.post('/meals/:mealId/meta', async (req, res) => {
  const mealId = (req.params.mealId || '').trim();
  if (!mealId) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Saknar måltids-id.'
    });
  }

  const tags = tagFromCheckboxes(req.body);
  updateMealMeta(mealId, { tags });
  return res.redirect('/backend');
});

router.post('/meals/:mealId/ingredients', async (req, res) => {
  const mealId = (req.params.mealId || '').trim();
  if (!mealId) {
    res.status(400);
    return await renderBackend(req, res, {
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

router.post('/meals/:mealId/delete', async (req, res) => {
  const mealId = (req.params.mealId || '').trim();
  if (!mealId) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Saknar måltids-id.'
    });
  }

  deleteMealById(mealId);
  return res.redirect('/backend');
});

router.post('/schedule/generate', async (req, res) => {
  const meals = getMeals();
  if (!meals.length) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Lägg till minst en måltid innan du genererar ett schema.'
    });
  }

  const persistedRules = req.currentUser ? await getRulesByUserId(req.currentUser.id) : null;
  const rules = normalizeRules(persistedRules);

  const fishMeals = meals.filter((meal) => (meal.tags || []).includes('fish'));
  const vegetarianMeals = meals.filter((meal) => (meal.tags || []).includes('vegetarian'));
  const specialMeals = meals.filter((meal) => (meal.tags || []).includes('special'));
  const nonSpecialMeals = meals.filter((meal) => !(meal.tags || []).includes('special'));

  if (!fishMeals.length) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Det krävs minst en fiskmåltid för att autofylla veckorna.'
    });
  }

  if (!vegetarianMeals.length) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Det krävs minst en vegetarisk måltid för att autofylla veckorna.'
    });
  }

  if (!specialMeals.length) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Det krävs minst en specialmåltid för fredag/lördag.'
    });
  }

  if (!nonSpecialMeals.length) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Det krävs minst en icke-specialmåltid för vardagar/söndag.'
    });
  }

  const firstWeekStart = startOfWeek(new Date());

  for (let i = 0; i < rules.planningHorizonWeeks; i += 1) {
    const weekStart = new Date(
      firstWeekStart.getFullYear(),
      firstWeekStart.getMonth(),
      firstWeekStart.getDate() + i * 7
    );
    const schedule = generateRandomWeekSchedule(meals, weekStart);
    if (schedule && Array.isArray(schedule.entries)) {
      const entriesByDay = new Map(schedule.entries.map((entry) => [entry.day, entry]));

      const fishMeal = randomItem(fishMeals);
      const specialMeal = randomItem(specialMeals);
      let vegCandidates = vegetarianMeals.filter(
        (meal) => meal.id !== fishMeal.id && meal.id !== specialMeal.id
      );
      if (!vegCandidates.length) {
        vegCandidates = vegetarianMeals;
      }
      const vegetarianMeal = randomItem(vegCandidates);

      // Fixed constraints:
      // - One fish day is randomly picked Monday-Thursday.
      // - Friday and Saturday must be the same special meal.
      const preferredFishDays = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag'];
      const fishDayCandidates = preferredFishDays.filter((day) => !rules.specialDays.includes(day));
      const selectedFishDay = randomItem(fishDayCandidates.length ? fishDayCandidates : preferredFishDays);
      const fishDayEntry = entriesByDay.get(selectedFishDay);
      if (fishDayEntry) {
        fishDayEntry.mealId = fishMeal.id;
        fishDayEntry.mealName = fishMeal.name;
      }

      // Additional fish placements if requested.
      const extraFishDays = DAYS.filter(
        (day) =>
          day !== selectedFishDay &&
          !rules.specialDays.includes(day)
      );
      let fishPlaced = fishDayEntry ? 1 : 0;
      while (fishPlaced < rules.fishMealsPerWeek && extraFishDays.length) {
        const day = randomItem(extraFishDays);
        const idx = extraFishDays.indexOf(day);
        if (idx >= 0) extraFishDays.splice(idx, 1);
        const entry = entriesByDay.get(day);
        if (!entry) continue;
        const chosen = randomItem(fishMeals);
        entry.mealId = chosen.id;
        entry.mealName = chosen.name;
        fishPlaced += 1;
      }

      rules.specialDays.forEach((day) => {
        const specialEntry = entriesByDay.get(day);
        if (!specialEntry) return;
        specialEntry.mealId = specialMeal.id;
        specialEntry.mealName = specialMeal.name;
      });

      // Never allow special meals outside selected special days.
      const nonSpecialDays = DAYS.filter((day) => !rules.specialDays.includes(day));
      nonSpecialDays.forEach((day) => {
        const entry = entriesByDay.get(day);
        if (!entry) return;
        const currentMeal = meals.find((meal) => meal.id === entry.mealId);
        if (currentMeal && (currentMeal.tags || []).includes('special')) {
          const fallbackCandidates = nonSpecialMeals.filter(
            (meal) => meal.id !== specialMeal.id
          );
          const fallback = randomItem(fallbackCandidates.length ? fallbackCandidates : nonSpecialMeals);
          entry.mealId = fallback.id;
          entry.mealName = fallback.name;
        }
      });

      // Place configured number of vegetarian meals on allowed days.
      const vegDays = (rules.vegetarianAllowedDays.length
        ? rules.vegetarianAllowedDays
        : ['Måndag', 'Onsdag', 'Torsdag', 'Söndag']
      ).filter((day) => !rules.specialDays.includes(day));
      const vegPool = [...vegDays];
      let vegPlaced = 0;
      while (vegPlaced < rules.vegetarianMealsPerWeek && vegPool.length) {
        const day = randomItem(vegPool);
        const idx = vegPool.indexOf(day);
        if (idx >= 0) vegPool.splice(idx, 1);
        const vegEntry = entriesByDay.get(day);
        if (!vegEntry) continue;
        const chosenVeg = vegPlaced === 0 ? vegetarianMeal : randomItem(vegetarianMeals);
        vegEntry.mealId = chosenVeg.id;
        vegEntry.mealName = chosenVeg.name;
        vegPlaced += 1;
      }
    }
    upsertScheduleByWeekStart(schedule);
  }

  return res.redirect('/backend');
});

router.post('/schedule/:scheduleId/update', async (req, res) => {
  const scheduleId = (req.params.scheduleId || '').trim();
  if (!scheduleId) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Saknar schema-id.'
    });
  }

  const schedules = getSchedules();
  const schedule = schedules.find((item) => item.id === scheduleId);
  if (!schedule) {
    res.status(404);
    return await renderBackend(req, res, {
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
    return await renderBackend(req, res, {
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
        return await renderBackend(req, res, {
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
      return await renderBackend(req, res, {
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

router.post('/schedule/delete', async (req, res) => {
  const scheduleId = (req.body.scheduleId || '').trim();
  if (!scheduleId) {
    res.status(400);
    return await renderBackend(req, res, {
      error: 'Saknar schema-id.'
    });
  }

  deleteScheduleById(scheduleId);
  return res.redirect('/backend');
});

router.post('/rules', async (req, res) => {
  const rules = normalizeRules({
    planningHorizonWeeks: req.body.planningHorizonWeeks,
    fishMealsPerWeek: req.body.fishMealsPerWeek,
    vegetarianMealsPerWeek: req.body.vegetarianMealsPerWeek,
    specialDays: parseDaysInput(req.body.specialDays),
    vegetarianAllowedDays: parseDaysInput(req.body.vegetarianAllowedDays),
    sameSpecialAcrossSpecialDays: req.body.sameSpecialAcrossSpecialDays === 'on'
  });

  if (!req.currentUser) {
    return res.redirect('/auth/login');
  }
  await upsertRulesByUserId(req.currentUser.id, rules);
  return res.redirect('/backend');
});

router.post('/settings/username', async (req, res, next) => {
  try {
    const nextUsername = (req.body.username || req.body.email || '').trim().toLowerCase();
    const currentPassword = req.body.currentPassword || '';

    if (!nextUsername || !currentPassword) {
      return await renderBackend(req, res, {
        settingsError: 'Användarnamn och nuvarande lösenord måste fyllas i.'
      });
    }

    const ok = await bcrypt.compare(currentPassword, req.currentUser.password_hash);
    if (!ok) {
      return await renderBackend(req, res, {
        settingsError: 'Nuvarande lösenord är felaktigt.'
      });
    }

    try {
      await updateUsername(req.currentUser.id, nextUsername);
      return await renderBackend(req, res, {
        settingsMessage: 'Användarnamnet har uppdaterats.'
      });
    } catch (err) {
      if (String(err.message).includes('UNIQUE constraint failed')) {
        return await renderBackend(req, res, {
          settingsError: 'Användarnamnet används redan.'
        });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
});


router.post('/settings/email', async (req, res, next) => {
  try {
    const nextUsername = (req.body.username || req.body.email || '').trim().toLowerCase();
    const currentPassword = req.body.currentPassword || '';

    if (!nextUsername || !currentPassword) {
      return await renderBackend(req, res, {
        settingsError: 'Användarnamn och nuvarande lösenord måste fyllas i.'
      });
    }

    const ok = await bcrypt.compare(currentPassword, req.currentUser.password_hash);
    if (!ok) {
      return await renderBackend(req, res, {
        settingsError: 'Nuvarande lösenord är felaktigt.'
      });
    }

    try {
      await updateUsername(req.currentUser.id, nextUsername);
      return await renderBackend(req, res, {
        settingsMessage: 'Användarnamnet har uppdaterats.'
      });
    } catch (err) {
      if (String(err.message).includes('UNIQUE constraint failed')) {
        return await renderBackend(req, res, {
          settingsError: 'Användarnamnet används redan.'
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
      return await renderBackend(req, res, {
        settingsError: 'Nuvarande lösenord, nytt lösenord och bekräftelse måste fyllas i.'
      });
    }

    if (newPassword.length < 8) {
      return await renderBackend(req, res, {
        settingsError: 'Nytt lösenord måste vara minst 8 tecken.'
      });
    }

    if (newPassword !== confirmPassword) {
      return await renderBackend(req, res, {
        settingsError: 'Nytt lösenord och bekräftelse matchar inte.'
      });
    }

    const ok = await bcrypt.compare(currentPassword, req.currentUser.password_hash);
    if (!ok) {
      return await renderBackend(req, res, {
        settingsError: 'Nuvarande lösenord är felaktigt.'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await updateUserPasswordHash(req.currentUser.id, passwordHash);

    return await renderBackend(req, res, {
      settingsMessage: 'Lösenordet har uppdaterats.'
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
