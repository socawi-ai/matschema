// Reading form fields safely. Express parses `name[]=a&name[]=b` into an
// array and `name[x]=1` into an object, so a field can be anything; these
// helpers only accept plain text.

// Maximum lengths (characters) for text fields.
const LIMITS = {
  name: 100, // meal names, one-off meals
  ingredient: 100,
  ingredients: 50, // lines per meal
  productName: 200, // deal product names (category corrections)
  username: 64,
  password: 200
};

// The field as trimmed text, or '' when it's missing or not text.
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// A password field: text as typed (spaces may be intentional), or ''.
function secret(value) {
  return typeof value === 'string' ? value : '';
}

// The field as a list of texts (checkboxes sharing a name), ignoring
// anything that isn't text.
function textList(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map(text).filter(Boolean);
}

module.exports = { LIMITS, secret, text, textList };
