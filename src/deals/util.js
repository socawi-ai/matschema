// Helpers shared by the deal sources.

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 Matschema';

// Largest response accepted from a chain's website. The biggest page seen
// is about 0.6 MB; this only guards against something going badly wrong.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

async function fetchText(url, { headers = {}, timeoutMs = 20000, maxBytes = MAX_RESPONSE_BYTES } = {}) {
  const host = new URL(url).hostname;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'sv-SE,sv;q=0.9', ...headers },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`${host} svarade ${response.status}`);
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    throw new Error(`${host} skickade för mycket data`);
  }
  // Read in chunks so an oversized response is cut off rather than buffered.
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error(`${host} skickade för mycket data`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchJson(url, options) {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${new URL(url).hostname} svarade inte med JSON`);
  }
}

// 29.9 -> "29,90", 109 -> "109"
function formatSek(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace('.', ',');
}

// Accepts an ISO string, a millisecond timestamp, or "dd/mm-yyyy" (Willys).
// Returns an ISO string, or null when the value is missing or unreadable.
function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const dmy = value.match(/^(\d{1,2})\/(\d{1,2})-(\d{4})$/);
    if (dmy) {
      return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])).toISOString();
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Cuts the JSON array that follows `"key":` out of a larger text (a page's
// embedded state), by bracket matching that respects strings. Embedded page
// state is JavaScript, not JSON, so bare `undefined` values become null.
function extractJsonArray(text, key) {
  const marker = `"${key}":[`;
  const start = text.indexOf(marker);
  if (start < 0) return null;

  let index = start + marker.length - 1;
  let depth = 0;
  let inString = false;
  for (; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === '[' || char === '{') {
      depth += 1;
    } else if (char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  const raw = text.slice(start + marker.length - 1, index + 1);
  return JSON.parse(raw.replace(/:undefined(?=[,}\]])/g, ':null'));
}

module.exports = { USER_AGENT, extractJsonArray, fetchJson, fetchText, formatSek, toIso };
