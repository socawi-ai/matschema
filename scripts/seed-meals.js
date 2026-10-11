const { loadEnvFile } = require('../src/load-env');

loadEnvFile();

const { addMeal, getMeals, updateMeal } = require('../src/data/store');

// Example meals for development and testing. They cover every main
// ingredient (protein) category the deal prioritization works with, plus a
// couple without one, and enough fish, vegetarian and special (⭐) meals for
// the planning rules.
const taggedMeals = [
  // Chicken
  { name: 'Krämig kycklingpasta', tags: ['regular'], ingredients: ['Kyckling', 'Pasta', 'Grädde', 'Vitlök', 'Parmesan'] },
  { name: 'Kycklinggryta med curry', tags: ['regular'], ingredients: ['Kycklinglårfilé', 'Kokosmjölk', 'Curry', 'Ris', 'Paprika'] },
  { name: 'Ugnsrostad kyckling med rotfrukter', tags: ['regular'], ingredients: ['Kycklingklubbor', 'Potatis', 'Morötter', 'Rödlök', 'Rosmarin'] },
  { name: 'Kyckling parmigiana', tags: ['regular', 'special'], ingredients: ['Kycklingfilé', 'Tomatsås', 'Mozzarella', 'Parmesan', 'Pasta'] },
  // Minced meat
  { name: 'Köttfärsgratäng', tags: ['regular'], ingredients: ['Nötfärs', 'Potatis', 'Tomatsås', 'Lök', 'Ost'] },
  { name: 'Spaghetti bolognese', tags: ['regular'], ingredients: ['Nötfärs', 'Spaghetti', 'Krossade tomater', 'Lök', 'Morot', 'Parmesan'] },
  { name: 'Tacos', tags: ['regular'], ingredients: ['Köttfärs', 'Tortillabröd', 'Tomat', 'Gurka', 'Sallad', 'Riven ost', 'Gräddfil'] },
  { name: 'Köttbullar med potatismos', tags: ['regular'], ingredients: ['Blandfärs', 'Potatis', 'Mjölk', 'Smör', 'Lingonsylt'] },
  { name: 'Lasagne', tags: ['regular'], ingredients: ['Blandfärs', 'Lasagneplattor', 'Krossade tomater', 'Mjölk', 'Ost'] },
  { name: 'Chili con carne', tags: ['regular'], ingredients: ['Nötfärs', 'Kidneybönor', 'Krossade tomater', 'Lök', 'Ris'] },
  // Meat
  { name: 'Teriyakibiff med ris', tags: ['regular'], ingredients: ['Nötkött', 'Ris', 'Broccoli', 'Teriyakisås', 'Sesam'] },
  { name: 'Fläskfilé med klyftpotatis', tags: ['regular'], ingredients: ['Fläskfilé', 'Potatis', 'Champinjoner', 'Grädde', 'Lök'] },
  { name: 'Rödvinsbräserad högrev', tags: ['regular', 'special'], ingredients: ['Högrev', 'Rödvin', 'Morot', 'Lök', 'Timjan'] },
  { name: 'Entrecôte med bearnaise', tags: ['regular', 'special'], ingredients: ['Entrecôte', 'Potatis', 'Bearnaisesås', 'Haricots verts', 'Tomat'] },
  // Sausage & bacon
  { name: 'Korv stroganoff', tags: ['regular'], ingredients: ['Falukorv', 'Ris', 'Krossade tomater', 'Grädde', 'Lök'] },
  { name: 'Pasta carbonara', tags: ['regular'], ingredients: ['Bacon', 'Spaghetti', 'Ägg', 'Parmesan'] },
  { name: 'Kassler med ananas och ris', tags: ['regular'], ingredients: ['Kassler', 'Ananas', 'Ris', 'Grädde', 'Curry'] },
  // Fish
  { name: 'Fisk tacos med limecreme', tags: ['fish'], ingredients: ['Vit fisk', 'Tortilla', 'Rödkål', 'Lime', 'Creme fraiche'] },
  { name: 'Ugnsbakad lax med örter', tags: ['fish'], ingredients: ['Lax', 'Citron', 'Dill', 'Potatis', 'Smör'] },
  { name: 'Fiskpinnar med potatismos', tags: ['fish'], ingredients: ['Fiskpinnar', 'Potatis', 'Mjölk', 'Smör', 'Ärtor'] },
  { name: 'Kolja med äggsås', tags: ['fish'], ingredients: ['Kolja', 'Potatis', 'Ägg', 'Smör', 'Dill'] },
  { name: 'Räkpasta', tags: ['fish'], ingredients: ['Räkor', 'Pasta', 'Grädde', 'Vitlök', 'Citron'] },
  { name: 'Smörstekt torskrygg', tags: ['fish', 'special'], ingredients: ['Torskrygg', 'Smör', 'Potatispuré', 'Ärtor', 'Citron'] },
  // Vegetarian
  { name: 'Rostad tomat- och linssoppa', tags: ['vegetarian'], ingredients: ['Tomater', 'Röda linser', 'Lök', 'Vitlök', 'Buljong'] },
  { name: 'Falafel med bulgursallad', tags: ['vegetarian'], ingredients: ['Falafel', 'Bulgur', 'Gurka', 'Tomat', 'Yoghurt'] },
  { name: 'Tofu-wok med nudlar', tags: ['vegetarian'], ingredients: ['Tofu', 'Nudlar', 'Broccoli', 'Paprika', 'Soja'] },
  { name: 'Vegetarisk chili', tags: ['vegetarian'], ingredients: ['Kidneybönor', 'Svarta bönor', 'Krossade tomater', 'Paprika', 'Ris'] },
  { name: 'Svamprisotto', tags: ['vegetarian', 'special'], ingredients: ['Arborioris', 'Svamp', 'Parmesan', 'Schalottenlök', 'Buljong'] },
  { name: 'Vegetarisk moussaka', tags: ['vegetarian', 'special'], ingredients: ['Aubergine', 'Linser', 'Tomatsås', 'Bechamel', 'Ost'] },
  // No main ingredient category (never prioritized by deals)
  { name: 'Halloumiwraps', tags: ['vegetarian'], ingredients: ['Halloumi', 'Tortillabröd', 'Sallad', 'Yoghurt', 'Paprika'] },
  { name: 'Pannkakor med sylt', tags: ['vegetarian'], ingredients: ['Vetemjöl', 'Mjölk', 'Ägg', 'Smör', 'Sylt'] }
];

async function main() {
  const meals = await getMeals();
  const byName = new Map(meals.map((meal) => [meal.name.trim().toLowerCase(), meal]));

  for (const incoming of taggedMeals) {
    const existing = byName.get(incoming.name.trim().toLowerCase());
    if (existing) {
      await updateMeal(existing.id, incoming);
    } else {
      await addMeal(incoming.name, incoming.ingredients, incoming.tags);
    }
  }

  console.log(`Klar: ${taggedMeals.length} måltidsexempel seedade/uppdaterade.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
