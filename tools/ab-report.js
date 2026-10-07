#!/usr/bin/env node
'use strict';
// `npm run ab` — the homepage tiles test, drawings against photos (studio
// #1185). Reads the daily totals netlify/functions/ab.js keeps in the
// website's Netlify Blobs store, through the Netlify API, and prints per
// version: page views, then scans, demo presses and sign-up presses as counts
// and as a share of views, in total and per day. Then a two-proportion z-test
// on the scan rate, with one line saying whether the gap is significant at
// 95% yet.
//
// Needs NETLIFY_API_TOKEN (a personal access token). The site is the
// WEBSITE's, looked up by its domain, prospektor.ai; NETLIFY_SITE_ID in a
// studio session names the studio's site, so it is deliberately not read.
// AB_SITE_ID overrides the lookup. The token is never printed.
//
// Exits 0 with a report (an empty store is a report: "nothing counted yet"),
// 1 when the token is missing or the API or the store cannot be reached.

const { getStore } = require('@netlify/blobs');

const STORE = 'ab-tiles';
const DOMAIN = 'prospektor.ai';
const ARMS = ['draw', 'photo'];
const EVENTS = ['scan', 'demo', 'signup'];

function fail(msg) {
  console.error('npm run ab: ' + msg);
  process.exit(1);
}

// The token must never reach the output, even inside an error the API or the
// library hands back.
function scrub(text, token) {
  const s = String(text);
  return token ? s.split(token).join('[token]') : s;
}

async function siteId(token) {
  if (process.env.AB_SITE_ID) return process.env.AB_SITE_ID;
  let res;
  try {
    res = await fetch('https://api.netlify.com/api/v1/sites/' + DOMAIN, {
      headers: { authorization: 'Bearer ' + token },
    });
  } catch (err) {
    fail('could not reach the Netlify API (' + scrub(err.message, token) + ').');
  }
  if (res.status === 401 || res.status === 403) fail(`the Netlify API refused the token (${res.status}).`);
  if (!res.ok) fail(`the Netlify API answered ${res.status} for the site ${DOMAIN}.`);
  const site = await res.json().catch(() => null);
  if (!site || !site.id) fail(`the Netlify API returned no site for ${DOMAIN}.`);
  return site.id;
}

// Two-proportion z-test: is the photo arm's rate different from the drawing
// arm's? Pooled standard error. Null when either arm has no views or the
// pooled rate is 0 or 1 (no variance to test against).
function zTest(x1, n1, x2, n2) {
  if (!n1 || !n2) return null;
  const p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = (p2 - p1) / se;
  return { p1, p2, z, pValue: 2 * (1 - phi(Math.abs(z))) };
}

// Standard normal CDF (Abramowitz and Stegun 7.1.26), good to 1e-7.
function phi(x) {
  const t = 1 / (1 + 0.3275911 * x / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + y);
}

const pct = (x, n) => (n ? (100 * x / n).toFixed(1) + '%' : '-');

function row(label, day) {
  return ARMS.map(a => {
    const d = day[a];
    const cells = EVENTS.map(e => `${e} ${d[e]} (${pct(d[e], d.view)})`).join('  ');
    return `  ${label.padEnd(10)} ${a.padEnd(5)}  views ${String(d.view).padStart(6)}  ${cells}`;
  }).join('\n');
}

function zero() {
  return Object.fromEntries(ARMS.map(a => [a, { view: 0, scan: 0, demo: 0, signup: 0 }]));
}

function add(into, day) {
  for (const a of ARMS) for (const e of ['view', ...EVENTS]) into[a][e] += Number(day && day[a] && day[a][e]) || 0;
  return into;
}

function report(days) {
  const keys = Object.keys(days).sort();
  if (!keys.length) {
    console.log('Tiles test (drawings against photos): nothing counted yet.');
    console.log('The test counts only once the four photos are on the site (src/_data/abtest.js).');
    return;
  }
  const all = keys.reduce((t, k) => add(t, days[k]), zero());
  console.log(`Tiles test (drawings against photos), ${keys[0]} to ${keys[keys.length - 1]}, UTC days\n`);
  console.log('Total');
  console.log(row('', all));
  console.log('\nPer day');
  for (const k of keys) console.log(row(k, add(zero(), days[k])));

  const t = zTest(all.draw.scan, all.draw.view, all.photo.scan, all.photo.view);
  console.log('\nScan rate, photo against drawing');
  if (!t) {
    console.log('  Not enough data for a test yet (an arm has no views, or no scans at all).');
    return;
  }
  const diff = (100 * (t.p2 - t.p1)).toFixed(2);
  console.log(`  drawing ${(100 * t.p1).toFixed(2)}%  photo ${(100 * t.p2).toFixed(2)}%  difference ${diff} points  z = ${t.z.toFixed(2)}  p = ${t.pValue.toFixed(3)}`);
  console.log(Math.abs(t.z) >= 1.96
    ? `  Significant at 95%: the ${t.p2 > t.p1 ? 'photos' : 'drawings'} get more scans.`
    : '  Not significant at 95% yet. Keep it running.');
}

async function main() {
  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) fail('NETLIFY_API_TOKEN is not set, so the store cannot be read.');
  const siteID = await siteId(token);
  const days = {};
  try {
    const store = getStore({ name: STORE, siteID, token });
    const { blobs } = await store.list();
    for (const { key } of blobs) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      days[key] = await store.get(key, { type: 'json' });
    }
  } catch (err) {
    fail('could not read the store (' + scrub(err.message, token) + ').');
  }
  report(days);
}

if (require.main === module) main().catch(err => fail(scrub(err.message, process.env.NETLIFY_API_TOKEN)));

module.exports = { zTest, report, phi };
