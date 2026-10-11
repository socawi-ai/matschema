const ALLOWED_TAGS = new Set(['regular', 'vegetarian', 'fish', 'special']);

// Brings a meal into the current shape: a `tags` list with exactly one of
// regular/vegetarian/fish plus optionally "special". Also accepts the legacy
// shape ({ tag, special }) that early versions wrote to meals.json.
function normalizeMeal(meal) {
  let tags = Array.isArray(meal.tags) ? meal.tags.filter((tag) => ALLOWED_TAGS.has(tag)) : [];

  if (!tags.length) {
    if (meal.tag && ALLOWED_TAGS.has(meal.tag)) {
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
    ingredients: Array.isArray(meal.ingredients) ? meal.ingredients.map(String) : [],
    tags,
    tag: primaryTag,
    special: tags.includes('special')
  };
}

module.exports = { normalizeMeal };
