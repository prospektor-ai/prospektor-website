// /integrations/close/ — the partner landing page (#620) and the offer it is
// allowed to print (#622).
//
// The one thing this file exists to prevent, and it is `CLAUDE.md`'s single
// condition that survives whatever else flips: **a published sentence that is
// false**. Two ways this page could produce one, and both are checked here in
// both directions.
//
//   1. The page promises a free month the checkout call would not grant.
//      Guarded by building the site twice, armed and dark, and asserting the
//      offer block exists in exactly one of them — the same env var decides
//      the block and the `trial_period_days` (`lib/trial.js`).
//   2. The page prints a number of days Stripe was not sent. Guarded by
//      reading every "N days" out of the built page and holding it to
//      `TRIAL_DAYS`, which is also the only value `CLOSE_TRIAL_DAYS` accepts.
//
// Nothing here counts sentences, sections or languages — the #131 rule. Adding
// a paragraph, a bullet or a fifth language can only turn this red by making a
// promise the code does not keep.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { buildInto, siteBuild } = require('./helpers.js');
const { TRIAL_DAYS, trialDays } = require('../lib/trial.js');
const i18n = require('../lib/i18n.js');

const PAGE = 'integrations/close/index.html';
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

// The dark build is the suite's own — every other test file reads it, and the
// offer is dark there because nothing sets the variable.
let dark, DARK;
// The armed one is built here, once, and is the only build in the suite that
// has ever had `CLOSE_TRIAL_DAYS` set.
let ARMED;

describe('/integrations/close/ — the page, and the offer it may print', () => {
  before(() => {
    dark = siteBuild('close');
    DARK = dark.dir;
    ARMED = fs.mkdtempSync(path.join(os.tmpdir(), 'close-armed-'));
    buildInto(ARMED, { CLOSE_TRIAL_DAYS: String(TRIAL_DAYS) });
  });
  after(() => {
    if (dark) dark.cleanup();
    if (ARMED) fs.rmSync(ARMED, { recursive: true, force: true });
  });

  const read = (dir, p) => fs.readFileSync(path.join(dir, p), 'utf8');

  test('the page Close\'s directory points at is actually written', () => {
    assert.ok(fs.existsSync(path.join(DARK, PAGE)),
      'the listing form has a required Marketing URL field and this is the URL — it answered 404 until #620');
  });

  test('it exists in every language the site is built in', () => {
    // Derived from the catalogues, never listed: delete es.json and this page's
    // Spanish twin leaves with every other Spanish page.
    for (const l of i18n.built()) {
      const p = path.join(l.prefix.replace(/^\//, ''), PAGE);
      assert.ok(fs.existsSync(path.join(DARK, p)), `${l.code}: ${p} was not written`);
    }
  });

  test('the census it leads with is dated, because a shelf grows', () => {
    const body = text(read(DARK, PAGE));
    assert.match(body, /\b39\b/, 'the count is the argument (#567, read 9 Sep 2026)');
    assert.match(body, /2026/, 'an undated count is a sentence that goes false without anybody editing it');
  });

  test('the buy form is this page\'s own, and it says which arrival it is', () => {
    const html = read(DARK, PAGE);
    // Every id buy.js binds to, for /pricing/'s reason: the direct pay path was
    // once asked for, built as a link, and recorded as shipped.
    for (const id of ['buyForm', 'buyEmail', 'buyBtn', 'buySite', 'buyMsg', 'buyLink', 'buyLive'])
      assert.match(html, new RegExp(`id="${id}"`), `#${id} is missing — buy.js binds to it by id`);
    assert.match(html, /data-via="close"/, 'the offer belongs to the page, not to a query parameter');
    assert.match(html, /data-from="close"/, 'a cancelled checkout must come back here');
  });

  test('with the offer dark the page promises no trial at all', () => {
    assert.equal(trialDays({}), 0);
    const body = text(read(DARK, PAGE));
    for (const re of [/free for/i, /first month free/i, /30 days/i, /\$0 today/i])
      assert.ok(!re.test(body), `the dark build says ${re} — the checkout call would grant nothing`);
  });

  test('armed, it states the offer, and states what happens after it', () => {
    const body = text(read(ARMED, PAGE));
    assert.match(body, /first month free/i);
    assert.match(body, new RegExp(`${TRIAL_DAYS} days`), 'the reader is owed the number Stripe is sent');
    assert.match(body, /\$999/, 'a trial that converts must say what it converts to');
    assert.match(body, /hello@prospektor\.ai/, 'a cancel-any-time promise needs the way to cancel');
  });

  test('every span of days the OFFER prints is the span Stripe is sent', () => {
    // Scoped to the two pages that talk about the trial, in every language,
    // because the site legitimately names other durations (the DPA's retention
    // windows, a help guide's example). What is pinned is the promise: a
    // "14-day" sentence on a page whose only trial is 30 days is the failure.
    const wrong = [];
    for (const dir of [DARK, ARMED])
      for (const l of i18n.built())
        for (const p of [PAGE, 'checkout/done/index.html']) {
          const f = path.join(dir, l.prefix.replace(/^\//, ''), p);
          if (!fs.existsSync(f)) continue;
          const body = text(fs.readFileSync(f, 'utf8'));
          for (const m of body.matchAll(/(\d+)[\s-](?:days?|Tage|dagen|d[ií]as)\b/g))
            if (Number(m[1]) !== TRIAL_DAYS) wrong.push(`${path.relative(dir, f)} → ${m[0]}`);
        }
    assert.deepEqual(wrong, [],
      `every span of days on the offer's pages must be lib/trial.js's ${TRIAL_DAYS}:\n  ` + wrong.join('\n  '));
  });

  test('the confirmation page carries the sentence a trial buyer is owed', () => {
    // /checkout/done/ said "Payment confirmed" and "your receipt is on its
    // way" as constants. Both are false for a buyer who was charged nothing.
    const html = read(DARK, 'checkout/done/index.html');
    assert.match(html, /data-paid-show="paid"/);
    assert.match(html, /data-paid-show="trial"/);
    assert.match(text(html), /nothing charged/i);
  });

  test('the offer is stated where it is sold, and nowhere else', () => {
    // "Only the Close path gets it" (#622): the plain funnel keeps selling at
    // list price, so no other page may carry the sentence.
    const htmlPages = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? htmlPages(path.join(dir, e.name))
        : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []);
    const stray = htmlPages(ARMED)
      .filter(f => !/integrations[\\/]close/.test(f))
      .filter(f => /first month free|primer mes gratis|erster monat gratis|eerste maand gratis/i
        .test(text(fs.readFileSync(f, 'utf8'))));
    assert.deepEqual(stray.map(f => path.relative(ARMED, f)), [],
      'the free month is Close\'s offer — a page that states it is a page that cannot grant it');
  });

  test('CLOSE_TRIAL_DAYS is a switch, not a dial', () => {
    // The whole reason the number lives in the repo: an env var that could say
    // 14 would falsify the page from a dashboard, with no deploy and nothing
    // red. Anything but the published figure arms nothing.
    assert.equal(trialDays({ CLOSE_TRIAL_DAYS: String(TRIAL_DAYS) }), TRIAL_DAYS);
    for (const v of ['', '0', '14', '7', '60', 'true', 'yes', '30d', 'thirty', '-30', '030'])
      assert.equal(trialDays({ CLOSE_TRIAL_DAYS: v }), 0, `CLOSE_TRIAL_DAYS=${JSON.stringify(v)} must arm nothing`);
  });
});
