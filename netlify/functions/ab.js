// The homepage tiles test's counter (studio #1185). See src/_data/abtest.js
// for the test itself and src/assets/js/ab.js for the beacons that call this.
//
// POST {v, e}: v is the version the page view saw (draw | photo), e is what
// happened (view | scan | demo | signup). Anything else is a 400. Each good
// one adds 1 to that day's total for that pair, in one Netlify Blobs entry per
// UTC day:
//
//   2026-10-08 → {"draw":{"view":0,"scan":0,"demo":0,"signup":0},"photo":{…}}
//
// That entry is everything this function writes. It never stores, logs or
// reads into the count an IP address, a user agent, a referrer, a cookie or
// any other part of the request: the only thing it reads from the headers is
// the Origin, to drop beacons that did not come from a page on prospektor.ai
// (a deploy preview, a local build, another site's script), and that is
// compared and forgotten. There is no GET: the totals are read with
// `npm run ab`, through the Netlify API and a personal token, never in public.
//
// Daily cap, copied from reserve-spot.js (studio #1166): past DAILY_CAP events
// in a UTC day the door answers 204 and counts nothing, so a script posting
// in a loop can spoil one day's numbers and cost a bounded number of writes,
// and no more. The write is conditional on the version that was read (the
// blob's etag), so concurrent beacons cannot overwrite each other's counts;
// a lost race is retried a few times and then dropped. A store that cannot be
// reached fails CLOSED: 503 and nothing counted. A beacon's answer is never
// read by the page, so every failure here is a lost count and never a broken
// page.
const { connectLambda, getStore } = require('@netlify/blobs');

const { ARMS } = require('../../lib/ab');
const EVENTS = ['view', 'scan', 'demo', 'signup'];
const DAILY_CAP = 20000;
const MAX_BODY = 200;
const ORIGINS = new Set(['https://prospektor.ai', 'https://www.prospektor.ai']);
const STORE = 'ab-tiles';
let storeForTests;

function store(event) {
  if (storeForTests !== undefined) return storeForTests;
  if (event.blobs) connectLambda(event);
  return getStore({ name: STORE, consistency: 'strong' });
}

const empty = () => Object.fromEntries(ARMS.map(a => [a, Object.fromEntries(EVENTS.map(e => [e, 0]))]));

// A stored day, reshaped to exactly the arms and events above; anything else
// in it is dropped. Throws on an entry that is not JSON, so a damaged day is
// left alone rather than overwritten with zeros.
function normalise(data) {
  const out = empty();
  if (data == null) return out;
  const parsed = JSON.parse(String(data));
  for (const a of ARMS) for (const e of EVENTS) {
    const n = Number(parsed && parsed[a] && parsed[a][e]);
    out[a][e] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}

const total = day => ARMS.reduce((s, a) => s + EVENTS.reduce((t, e) => t + day[a][e], 0), 0);

// The pair from the body, or null for anything that is not exactly {v, e}
// with v an arm and e an event.
function pair(body) {
  if (typeof body !== 'string' || !body || body.length > MAX_BODY) return null;
  let data;
  try { data = JSON.parse(body); } catch (e) { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const keys = Object.keys(data).sort();
  if (keys.length !== 2 || keys[0] !== 'e' || keys[1] !== 'v') return null;
  if (!ARMS.includes(data.v) || !EVENTS.includes(data.e)) return null;
  return { v: data.v, e: data.e };
}

function originOf(event) {
  const h = event.headers || {};
  for (const k of Object.keys(h)) if (k.toLowerCase() === 'origin') return String(h[k]);
  return '';
}

// Adds one to today's v/e. Answers 'counted' or 'capped'; throws when the
// store cannot be reached or the count could not be landed.
async function count(event, { v, e }, now) {
  const s = store(event);
  const key = new Date(now).toISOString().slice(0, 10);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, etag } = await s.getWithMetadata(key, { consistency: 'strong' }) || {};
    const day = normalise(data);
    if (total(day) >= DAILY_CAP) return 'capped';
    day[v][e] += 1;
    const condition = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const { modified } = await s.set(key, JSON.stringify(day), condition);
    if (modified) return 'counted';
  }
  throw new Error('the day could not be written after four attempts');
}

const NONE = { statusCode: 204, body: '' };

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Method not allowed' };
  }
  let body = event.body;
  if (event.isBase64Encoded && typeof body === 'string' && body.length <= MAX_BODY * 2) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }
  const p = pair(body);
  if (!p) return { statusCode: 400, body: 'Bad request' };
  if (!ORIGINS.has(originOf(event))) return { statusCode: 403, body: 'Forbidden' };
  try {
    await count(event, p, Date.now());
  } catch (err) {
    console.error('ab: day count unreachable:', err.message);
    return { statusCode: 503, body: '' };
  }
  return NONE;
};

exports._setStoreForTests = s => { storeForTests = s; };
exports.DAILY_CAP = DAILY_CAP;
exports.ARMS = ARMS;
exports.EVENTS = EVENTS;
exports.STORE = STORE;
exports.normalise = normalise;
