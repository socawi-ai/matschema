// The key deals are matched on across stores and weeks (manual category
// corrections, "new this week"): the product name, ignoring case and
// whitespace.
function nameKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// first_seen_at for names that existed before tracking started.
const KNOWN_BEFORE_TRACKING = '1970-01-01T00:00:00.000Z';

module.exports = { KNOWN_BEFORE_TRACKING, nameKey };
