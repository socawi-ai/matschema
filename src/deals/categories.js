// Sorts deals into "everyday" grocery categories (vardagsvaror), so the
// admin can see the offers that matter for normal cooking first.
//
// Classification is by keywords in the product name, since Willys gives no
// category at all. Where a chain does give a category, it's used to rule out
// non-food, snacks and ready meals. Rules are checked in order and the first
// match wins, so more specific categories come first (e.g. "Köttfärs" before
// "Kött", "Kaffe" before "Ost" so that "Mellanrost" isn't cheese).
//
// Word boundaries: JavaScript's \b treats å/ä/ö as non-letters, so
// "Entrecôte" would contain the word "te". The helpers below use Unicode
// letter lookarounds instead. Swedish compounds matter too: "Prästost" is
// cheese, so many patterns match a word *ending* rather than a whole word.

const NOT_LETTER_BEFORE = '(?<!\\p{L})';
const NOT_LETTER_AFTER = '(?!\\p{L})';

// Whole words: word('ägg') matches "Ägg 10-pack" but not "Äggnudlar".
const word = (...words) => new RegExp(`${NOT_LETTER_BEFORE}(?:${words.join('|')})${NOT_LETTER_AFTER}`, 'iu');
// Word endings, for compounds: ending('ost') matches "Prästost" and "Ost".
const ending = (...words) => new RegExp(`(?:${words.join('|')})${NOT_LETTER_AFTER}`, 'iu');
// Anywhere in the name.
const anywhere = (...words) => new RegExp(`(?:${words.join('|')})`, 'iu');

const EVERYDAY_CATEGORIES = [
  // Milk, cream, crème fraiche, breakfast yoghurt & filmjölk, butter,
  // margarine and cooking fats/oils.
  { id: 'mejeri', label: 'Mejeri & matfett', emoji: '🥛' },
  { id: 'ost', label: 'Ost (påläggs- & hårdost)', emoji: '🧀' },
  { id: 'agg', label: 'Ägg', emoji: '🥚' },
  { id: 'kott', label: 'Kött', emoji: '🥩' },
  { id: 'kottfars', label: 'Köttfärs', emoji: '🥩' },
  { id: 'kyckling', label: 'Kyckling', emoji: '🍗' },
  { id: 'korv', label: 'Korv & bacon', emoji: '🌭' },
  { id: 'fisk', label: 'Fisk & skaldjur', emoji: '🐟' },
  { id: 'vego', label: 'Vegetariskt protein', emoji: '🌱' },
  { id: 'gronsaker', label: 'Grönsaker', emoji: '🥦' },
  { id: 'frysta-gronsaker', label: 'Frysta grönsaker', emoji: '🧊' },
  { id: 'potatis', label: 'Potatis', emoji: '🥔' },
  { id: 'pasta', label: 'Pasta', emoji: '🍝' },
  { id: 'ris', label: 'Ris & gryn', emoji: '🍚' },
  { id: 'mjol', label: 'Mjöl & bakning', emoji: '🌾' },
  { id: 'kaffe', label: 'Kaffe & te', emoji: '☕' }
];

// Store categories that are never everyday groceries. Careful with short
// words hiding in longer ones: "djur" is in "Fisk & skaldjur" and "läsk" in
// "Fläskkött", so those are matched as whole words.
const EXCLUDED_STORE_CATEGORY = new RegExp(
  [
    anywhere(
      'hem & fritid', 'hemmet', 'hälsa', 'skönhet', 'personlig vård', 'djurvård', 'husdjur', 'hundmat',
      'kattmat', 'toalettpapper', 'bordsdukning', 'glass', 'godis', 'konfektyr', 'choklad', 'öl & cider',
      'kall dryck', 'fruktjuice', 'kakor', 'snacks', 'desserter', 'pizza', 'färdigrätter', 'bröd',
      'bageri', 'marmelad', 'sylt', 'konserv'
    ).source,
    word('läsk', 'vin', 'vitt vin', 'rött vin').source,
    // Lidl's "Färdigmat från frysdisk", but not Coop's mixed "Chark/Deli/Färdigmat".
    '^färdigmat'
  ].join('|'),
  'iu'
);

// Words that make a product something other than what its other words
// suggest: snacks and sweets, drinks, bread, ready meals, sauces, cold cuts,
// canned goods (not chosen as a category), non-food. Watch for words hiding
// inside others: "läsk" is in "fläsk", "dryck" in "mjölkdryck".
const EXCLUDED_NAME = new RegExp(
  [
    anywhere(
      'choklad', 'godis', 'glass', 'chips', 'snacks', 'bågar', 'kex', 'kaka', 'kakor', 'tårta', 'bulle',
      'pizza', 'paj', 'shake', 'smoothie', 'juice', 'iskaffe', 'ikaffe', 'bröd', 'kokos', 'soppa',
      'gratäng', 'kebab', 'nugget', 'panerad', 'friterad', 'dressing', 'sås', 'dipp', 'röra', 'pesto',
      'risgrynsgröt', 'inlagd', 'senapssill', 'matjessill', 'löksill', 'salladsbar',
      'pastej', 'salami', 'pålägg', 'skinka', 'prosciutto', 'antipasti', 'rökt kalkon', 'krossade', 'passerade',
      'pumpakärnor', 'hund', 'katt', 'tvätt', 'servett', 'avfallspåse', 'fryspåsar',
      // Cheese: only sliceable and hard grating cheese counts as everyday.
      'mozzarella', 'burrata', 'brie', 'mascarpone', 'gorgonzola', 'färskost', 'mjukost', 'dessertost',
      'cottage cheese', 'halloumi', 'fetaost', 'scamorza', 'ricotta', 'philadelphia', 'chèvre',
      'camembert', 'smältost', 'ädelost', 'blåmögel', 'grillost'
    ).source,
    word('feta').source,
    `${NOT_LETTER_BEFORE}läsk`,
    '(?<!mjölk|havre|soja|mandel|ris)dryck'
  ].join('|'),
  'iu'
);

// Plant-based products that chains file under ready meals; kept even though
// that store category is otherwise excluded.
const PLANT_PROTEIN = anywhere('vegofärs', 'sojafärs', 'veganfärs', 'quorn', 'oumph', 'tofu', 'tempeh');

// Package size in grams or millilitres, from texts like "1kg", "1 l",
// "250 g.", "250 ml, 330 ml" (the largest size wins). null when unknown.
function packageSize(sizeText) {
  const factors = { g: 1, kg: 1000, ml: 1, cl: 10, dl: 100, l: 1000, liter: 1000 };
  let largest = null;
  for (const [, amount, unit] of String(sizeText || '').matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|liter|l)(?!\p{L})/giu)) {
    const value = Number(amount.replace(',', '.')) * factors[unit.toLowerCase()];
    if (largest === null || value > largest) largest = value;
  }
  return largest;
}

function isBreakfastYoghurt(cat, name, deal) {
  if (/kvarg|skyr|keso|kesella|drick|dessert|mellanmål|dryck/iu.test(name)) return false;
  const size = packageSize(deal.size);
  return size === null || size >= 500;
}

// [category id, name pattern, optional extra check (storeCategory, name, deal)]
const RULES = [
  ['kaffe', anywhere('kaffe', 'espresso', 'kaffekapslar', 'mellanrost', 'mörkrost', 'ljusrost', 'skånerost', 'bryggkaffe', 'snabbkaffe'), (cat, name) => !/grädde/iu.test(name)],
  ['kaffe', word('te', 'teblad', 'tepåsar', 'rooibos', 'grönt te', 'chai')],
  ['mejeri', anywhere('crème fraiche', 'creme fraiche', 'crème fraîche', 'gräddfil', 'matlagningsyoghurt')],
  // Ordinary sliceable cheese (påläggsost) and hard grating cheese. Soft
  // and speciality cheeses are excluded by name above.
  ['ost', anywhere(
    'parmesan', 'parmigiano', 'grana padano', 'pecorino', 'gräddis', 'präst', 'herrgård', 'grevé',
    'svecia', 'gouda', 'edamer', 'jarlsberg', 'norvegia', 'västerbotten', 'cheddar', 'appenzeller',
    'emmentaler', 'gruyère', 'billinge', 'klassiker', 'hushållsost', 'riven ost'
  )],
  ['ost', ending('ost', 'ostar'), (cat, name) => !/frukost|kompost|toast/iu.test(name)],
  ['mejeri', anywhere('grädde')],
  ['mejeri', ending('mjölk'), (cat, name) => !/fil|kokos|mandel|choklad/iu.test(name)],
  ['mejeri', anywhere('mellanmjölk', 'standardmjölk', 'lättmjölk', 'havredryck', 'mjölkdryck', 'laktosfri mjölk')],
  // Only ordinary breakfast yoghurt and filmjölk in family-size packs: not
  // kvarg, drinkable or dessert variants, or single-serving cups.
  ['mejeri', anywhere('yoghurt', 'yogurt', 'filmjölk'), isBreakfastYoghurt],
  ['mejeri', ending('fil'), (cat, name, deal) => !/profil/iu.test(name) && isBreakfastYoghurt(cat, name, deal)],
  ['mejeri', anywhere('smör', 'bregott', 'margarin', 'matfett', 'rapsolja', 'olivolja', 'solrosolja'), (cat, name) => !/fisk|tonfisk/iu.test(name)],
  ['mejeri', word('olja'), (cat, name) => !/fisk|tonfisk|sardin/iu.test(name)],
  ['agg', word('ägg', 'ägg \\d+-pack')],
  ['kottfars', ending('färs', 'köttfärs'), (cat, name) => !/vego|vegan|växtbas|soja|quorn|fisk|formbar/iu.test(name)],
  ['kottfars', anywhere('färsburgare', 'hamburgare')],
  ['korv', anywhere('korv', 'bacon', 'stekfläsk', 'kassler', 'chorizo', 'isterband', 'bratwurst', 'pancetta', 'guanciale', 'grillare', 'uddevallare')],
  ['kyckling', anywhere('kyckling', 'kalkon', 'fågel'), (cat, name) => !/buljong|kryddmix|kryddblandning|rökt kalkon/iu.test(name)],
  ['fisk', anywhere('fisk', 'lax', 'torsk', 'kolja', 'räkor', 'räka', 'makrill', 'sill', 'strömming', 'musslor', 'kräftor', 'skaldjur', 'pollock', 'rödspätta', 'gös', 'abborre', 'röding', 'regnbåge')],
  ['fisk', word('sej', 'hummer')],
  ['fisk', ending('flundra')],
  ['kott', anywhere(
    'fläskfilé', 'fläskkarré', 'karré', 'kotlett', 'entrecôte', 'entrecote', 'ryggbiff', 'oxfilé', 'högrev',
    'nötkött', 'fläskkött', 'fläsksida', 'sidfläsk', 'revben', 'grytbitar', 'lövbiff', 'rostbiff',
    'ytterfilé', 'innanlår', 'lammkött', 'kalvkött', 'viltkött', 'älgkött', 'renskav', 'fläskbog', 'skav',
    'fransyska', 'lamm', 'schnitzel', 'schnitzl', 'ribs', 'porchetta', 'köttbullar'
  ), (cat, name) => !/vego|vegan/iu.test(name)],
  ['kott', ending('stek', 'biff', 'fläsk', 'filé', 'lägg'), (cat, name) => !/vego|vegan|bön|soja/iu.test(name)],
  ['vego', anywhere('tofu', 'quorn', 'tempeh', 'oumph', 'sojabitar', 'sojafärs', 'vegofärs', 'veganfärs', 'falafel', 'linser', 'kikärt', 'bönbiff', 'vegobullar', 'växtbaserad')],
  ['vego', word('vego')],
  ['vego', ending('bönor'), (cat, name) => !/gröna bönor|haricots|kaffe/iu.test(name)],
  ['frysta-gronsaker', anywhere('wokgrönsaker', 'grönsaksblandning', 'ärtor', 'haricots', 'broccoli', 'blomkål', 'spenat', 'majs', 'gröna bönor', 'grönsaker'), (cat, name) => /fryst/iu.test(cat) || /fryst|djupfryst/iu.test(name)],
  ['potatis', ending('potatis'), (cat, name) => !/sötpotatis|mos|pommes|klyftor|strips/iu.test(name)],
  ['gronsaker', anywhere(
    'tomat', 'gurka', 'paprika', 'lök', 'morot', 'morötter', 'kål', 'broccoli', 'sallad', 'spenat',
    'zucchini', 'squash', 'aubergine', 'selleri', 'rödbetor', 'palsternacka', 'champinjon', 'svamp',
    'avokado', 'sparris', 'majs', 'haricots', 'gröna bönor', 'ruccola', 'rädisor', 'pumpa', 'pumpor',
    'ingefära', 'chili', 'sötpotatis', 'grönsaker', 'rotfrukter', 'betor', 'sallat', 'basilika',
    'koriander', 'persilja', 'gräslök', 'dill'
  ), (cat) => !/fryst/iu.test(cat)],
  ['pasta', anywhere(
    'pasta', 'spaghetti', 'penne', 'makaroner', 'fusilli', 'tagliatelle', 'lasagne', 'farfalle',
    'rigatoni', 'tortellini', 'ravioli', 'gnocchi', 'fettuccine', 'linguine', 'orecchiette'
  ), (cat, name) => !/fryst|sallad/iu.test(name)],
  ['ris', anywhere('jasminris', 'basmatiris', 'fullkornsris', 'grötris', 'avorioris', 'arborio', 'risotto', 'bulgur', 'couscous', 'matvete', 'mathavre', 'quinoa', 'nudlar', 'havregryn', 'gryn')],
  ['ris', word('ris'), (cat, name) => !/kaka|kakor|krisp|pudding/iu.test(name)],
  ['mjol', anywhere('mjöl', 'socker', 'jäst', 'bakpulver', 'maizena', 'bikarbonat')]
];

// When no name rule matches, a chain's own category can still say what a
// product is (e.g. Lidl files "Fish & Crisp gourmetfiléer" under fish).
// Only unambiguous store categories are listed.
const STORE_CATEGORY_HINTS = [
  [/fryst fisk|^fisk & skaldjur$/iu, 'fisk'],
  [/^fjäderfä$/iu, 'kyckling'],
  [/^(nötkött|fläskkött|övrigt kött)$/iu, 'kott'],
  [/^korv & charkuterier$/iu, 'korv'],
  [/^frysta frukter och grönsaker$/iu, 'frysta-gronsaker'],
  [/^(grönsaker|färska örter)$/iu, 'gronsaker'],
  [/^ost$/iu, 'ost'],
  [/^(smör|oljor och fetter)$/iu, 'mejeri'],
  [/^kaffe, te och kakao$/iu, 'kaffe']
];

// Returns an everyday category id for a deal, or null for everything else.
function classifyDeal(deal) {
  const name = String(deal.name || '');
  const storeCategory = String(deal.category || '').trim();
  if (EXCLUDED_STORE_CATEGORY.test(storeCategory) && !PLANT_PROTEIN.test(name)) return null;
  if (EXCLUDED_NAME.test(name)) return null;

  for (const [id, pattern, extra] of RULES) {
    if (pattern.test(name) && (!extra || extra(storeCategory, name, deal))) {
      return id;
    }
  }
  const hint = STORE_CATEGORY_HINTS.find(([pattern]) => pattern.test(storeCategory));
  return hint ? hint[1] : null;
}

module.exports = { EVERYDAY_CATEGORIES, classifyDeal, packageSize, RULES, STORE_CATEGORY_HINTS };
