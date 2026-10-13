// Shared by the public schedule (/frontend) and the Home Assistant view
// (/frontend/ha): theme toggle, ingredients and offers dialog, and keeping the page
// from going stale when it's left open.
(function () {
  // ---------- Theme ----------
  const toggle = document.getElementById('themeToggle');
  const getTheme = () => document.documentElement.getAttribute('data-theme') || 'light';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (toggle) {
      toggle.textContent = theme === 'dark' ? '☀️ Ljust läge' : '🌙 Mörkt läge';
    }
  }

  applyTheme(getTheme());

  if (toggle) {
    toggle.addEventListener('click', () => {
      const nextTheme = getTheme() === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('matschema-theme', nextTheme);
      } catch (_err) {
        // Storage can be blocked (e.g. in some iframes); the toggle still works for this visit.
      }
      applyTheme(nextTheme);
    });
  }

  // ---------- Ingredients dialog ----------
  const dialog = document.getElementById('ingredientsDialog');
  const dataElement = document.getElementById('meal-data');
  if (dialog && dataElement) {
    const meals = JSON.parse(dataElement.textContent || '{}');
    const title = document.getElementById('ingredientsTitle');
    const list = document.getElementById('ingredientsList');

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-meal-id]');
      if (!button) return;
      const meal = meals[button.dataset.mealId];
      if (!meal) return;

      title.textContent = meal.name;
      list.replaceChildren(
        ...meal.ingredients.map((ingredient) => {
          const item = document.createElement('li');
          item.textContent = ingredient;
          return item;
        })
      );
      // The meal's offers at the store the plan was made for, if any.
      const dealsBox = document.getElementById('mealDeals');
      const deals = meal.deals || [];
      if (dealsBox) {
        dealsBox.hidden = !deals.length;
        document.getElementById('mealDealsList').replaceChildren(
          ...deals.map((deal) => {
            const item = document.createElement('li');
            const name = document.createElement('strong');
            name.textContent = deal.name;
            item.append(name, deal.extra ? ` ${deal.extra}` : '');
            const info = document.createElement('span');
            info.className = 'shopping-info';
            info.textContent = deal.info.join(' · ');
            item.append(info);
            return item;
          })
        );
      }
      dialog.showModal();
    });

    // Clicking the backdrop (outside the dialog box) closes it.
    dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) dialog.close();
    });
  }

  // ---------- Stay fresh ----------
  // A tab left open (or a phone brought back hours later) would otherwise show
  // yesterday as "today". Reload when the date has changed or the page is old.
  const loadedAt = Date.now();
  const loadedOn = new Date().toDateString();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const stale = new Date().toDateString() !== loadedOn || Date.now() - loadedAt > 30 * 60 * 1000;
    if (stale && !(dialog && dialog.open)) {
      location.reload();
    }
  });
})();
