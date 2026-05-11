const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const mealsPath = path.join(dataDir, 'meals.json');

const taggedMeals = [
  { name: 'Krämig kycklingpasta', tags: ['regular'], ingredients: ['Kyckling', 'Pasta', 'Grädde', 'Vitlök', 'Parmesan'] },
  { name: 'Köttfärsgratäng', tags: ['regular'], ingredients: ['Nötfärs', 'Potatis', 'Tomatsås', 'Lök', 'Ost'] },
  { name: 'Teriyakibiff med ris', tags: ['regular'], ingredients: ['Nötkött', 'Ris', 'Broccoli', 'Teriyakisås', 'Sesam'] },
  { name: 'Rostad tomat- och linssoppa', tags: ['vegetarian'], ingredients: ['Tomater', 'Röda linser', 'Lök', 'Vitlök', 'Buljong'] },
  { name: 'Halloumiwraps', tags: ['vegetarian'], ingredients: ['Halloumi', 'Tortillabröd', 'Sallad', 'Yoghurt', 'Paprika'] },
  { name: 'Fisk tacos med limecreme', tags: ['fish'], ingredients: ['Vit fisk', 'Tortilla', 'Rödkål', 'Lime', 'Creme fraiche'] },
  { name: 'Ugnsbakad lax med örter', tags: ['fish'], ingredients: ['Lax', 'Citron', 'Dill', 'Potatis', 'Smör'] },
  { name: 'Svamprisotto', tags: ['vegetarian', 'special'], ingredients: ['Arborioris', 'Svamp', 'Parmesan', 'Schalottenlök', 'Buljong'] },
  { name: 'Rödvinsbräserad högrev', tags: ['regular', 'special'], ingredients: ['Högrev', 'Rödvin', 'Morot', 'Lök', 'Timjan'] },
  { name: 'Smörstekt torskrygg', tags: ['fish', 'special'], ingredients: ['Torskrygg', 'Smör', 'Potatispuré', 'Ärtor', 'Citron'] },
  { name: 'Vegetarisk moussaka', tags: ['vegetarian', 'special'], ingredients: ['Aubergine', 'Linser', 'Tomatsås', 'Bechamel', 'Ost'] },
  { name: 'Kyckling parmigiana', tags: ['regular', 'special'], ingredients: ['Kycklingfilé', 'Tomatsås', 'Mozzarella', 'Parmesan', 'Pasta'] }
];

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let meals = [];
if (fs.existsSync(mealsPath)) {
  meals = JSON.parse(fs.readFileSync(mealsPath, 'utf8'));
}

const byName = new Map(meals.map((meal) => [String(meal.name || '').trim().toLowerCase(), meal]));
for (const incoming of taggedMeals) {
  const key = incoming.name.trim().toLowerCase();
  const existing = byName.get(key);
  if (existing) {
    existing.ingredients = incoming.ingredients;
    existing.tags = incoming.tags;
  } else {
    const meal = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      name: incoming.name,
      ingredients: incoming.ingredients,
      tags: incoming.tags
    };
    meals.push(meal);
    byName.set(key, meal);
  }
}

fs.writeFileSync(mealsPath, JSON.stringify(meals, null, 2));
console.log(`Klar: ${taggedMeals.length} måltidsexempel seedade/uppdaterade.`);
