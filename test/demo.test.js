// The clickable demo (#767): the studio's tour on the real screens, held to
// the product rather than trusted.
//
// `/demo/` is nothing this repo wrote: `npm run demo:capture` reads the
// studio's one-minute tour (`TOUR_STEPS`) off the running product into
// `data/demo.json` and `src/assets/img/demo/`, and the page renders that. So
// the thing that can rot is the capture, and it rots the way a screenshot
// does: silently, while the product moves on. Two things hold it.
//
// - **Every sentence the demo says is one the studio says.** Each step's
//   title and body are `t('…')` strings in the studio, so they are in the
//   vendored inventory `data/studio-strings.json` (#745). A tour rewrite in
//   the studio reaches this repo as a red test naming `npm run demo:capture`
//   the day `npm run strings:snapshot` is next run, the same lag and the same
//   catch the articles' names have.
// - **Every name a step declares is in its own words and in the catalogue**,
//   with `tools/resources-coverage.js`'s own `says` (whole phrase, its case,
//   word boundaries), the way the studio's `dev/tour-coverage.js` reads the
//   same steps.
//
// The rest is the page: one figure per step in the tour's order, the lit
// element a link to the next step, the opening card offering every chapter,
// the walk ending on the free scan, and the door on the homepage. Nothing
// here counts steps, chapters or languages: a tour with twelve steps builds a
// demo with twelve figures and turns nothing red.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const i18n = require('../lib/i18n.js');
const { says } = require('../tools/resources-coverage.js');
const { everyLanguage } = require('../tools/demo-capture.js');
const { siteBuild } = require('./helpers.js');

const DATA = path.join(ROOT, 'data', 'demo.json');
const STRINGS = path.join(ROOT, 'data', 'studio-strings.json');
const demo = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const strings = () => new Set((JSON.parse(fs.readFileSync(STRINGS, 'utf8')).strings || []).map(i18n.normalizeKey));

const RECAPTURE = 'run `npm run demo:capture` with the studio checked out beside this repo and commit the result';

describe('the capture', () => {
  test('data/demo.json is there, stamped, and in the tour\'s shape', () => {
    assert.ok(fs.existsSync(DATA), `data/demo.json is missing — ${RECAPTURE}`);
    const d = demo();
    assert.match(String(d.capturedAt), /^\d{4}-\d{2}-\d{2}$/, 'the capture carries no date');
    assert.match(String(d.source && d.source.commit), /^[0-9a-f]{40}$/, 'the capture does not name the studio commit it was read from');
    assert.ok(Array.isArray(d.steps) && d.steps.length >= 5, `only ${(d.steps || []).length} steps — the tour has more than that, so the capture is broken rather than the tour short`);
    assert.ok(d.viewport && d.viewport.width > 0 && d.viewport.height > 0, 'no viewport: the page cannot size the screens');
    d.steps.forEach((s, i) => {
      assert.strictEqual(s.n, i + 1, `step ${i + 1} is numbered ${s.n}`);
      assert.ok(s.title && typeof s.title.en === 'string' && s.title.en.trim(), `step ${s.n}: no English title`);
      assert.ok(s.body && typeof s.body.en === 'string' && s.body.en.trim(), `step ${s.n}: no English sentence`);
      assert.ok(Array.isArray(s.names) && s.names.length, `step ${s.n}: declares no names — every tour step names what it teaches (#744)`);
      assert.match(String(s.image), /^\/assets\/img\/demo\/[a-z0-9-]+\.png$/, `step ${s.n}: the screen is not a PNG under /assets/img/demo/`);
      if (i > 0) assert.ok(s.chapter, `step ${s.n}: belongs to no chapter — every step after the opening card does (#766)`);
    });
  });

  test('every sentence the demo says is one the studio says', () => {
    const said = strings();
    const stale = [];
    for (const s of demo().steps) {
      for (const [what, text] of [['title', s.title.en], ['body', s.body.en]]) {
        if (!said.has(i18n.normalizeKey(text))) stale.push(`step ${s.n} ${what}: ${JSON.stringify(text)}`);
      }
    }
    assert.deepStrictEqual(stale, [],
      'the demo says sentences the studio no longer says (data/studio-strings.json), so the tour has moved on and the screens with it — '
      + `${RECAPTURE}:\n  ${stale.join('\n  ')}`);
  });

  test('every name a step declares is in its own words, and something the product says', () => {
    const said = [...strings()];
    const unsaid = [];
    const uncovered = [];
    for (const s of demo().steps) {
      for (const name of s.names) {
        if (!says(`${s.title.en}\n${s.body.en}`, name)) unsaid.push(`step ${s.n} names "${name}" and its card does not say it`);
        if (!said.some(str => says(str, name))) uncovered.push(`step ${s.n} names "${name}" and no screen or button says it any more`);
      }
    }
    assert.deepStrictEqual(unsaid, []);
    assert.deepStrictEqual(uncovered, [], `run \`npm run strings:snapshot\`, then ${RECAPTURE}:\n  ${uncovered.join('\n  ')}`);
  });

  test('every screen is on disk, and every ring is inside it', () => {
    for (const s of demo().steps) {
      const file = path.join(ROOT, 'src', s.image);
      assert.ok(fs.existsSync(file) && fs.statSync(file).size > 1000, `step ${s.n}: ${s.image} is missing or empty — ${RECAPTURE}`);
      if (s.ring === null) continue;
      const { x, y, w, h } = s.ring;
      assert.ok([x, y, w, h].every(v => typeof v === 'number' && v >= 0 && v <= 1), `step ${s.n}: the ring is not in fractions of the screen: ${JSON.stringify(s.ring)}`);
      assert.ok(w > 0.02 && h > 0.02, `step ${s.n}: the ring is too small to see: ${JSON.stringify(s.ring)}`);
      assert.ok(x + w <= 1.001 && y + h <= 1.001, `step ${s.n}: the ring runs off the screen: ${JSON.stringify(s.ring)}`);
    }
  });

  test('every chapter starts on a step that belongs to it, and every step past the first belongs to a chapter that exists', () => {
    const d = demo();
    assert.ok(d.chapters.length >= 2, 'fewer than two chapters is not a picker');
    const ids = new Set(d.chapters.map(c => c.id));
    for (const c of d.chapters) {
      const first = d.steps.find(s => s.n === c.first);
      assert.ok(first && first.chapter === c.id, `chapter ${c.id} starts on step ${c.first}, which is not its own`);
      assert.ok(c.name && c.name.en, `chapter ${c.id} has no English name`);
    }
    for (const s of d.steps.slice(1)) assert.ok(ids.has(s.chapter), `step ${s.n} belongs to "${s.chapter}", which is no chapter`);
  });

  test('everyLanguage puts English first and takes every catalogue that holds the sentence', () => {
    assert.deepStrictEqual(everyLanguage({ es: { Hello: 'Hola' }, de: {} }, 'Hello'), { en: 'Hello', es: 'Hola' });
    assert.deepStrictEqual(everyLanguage({}, 'Hello'), { en: 'Hello' });
  });
});

describe('the page', () => {
  let SITE, built;
  const read = p => fs.readFileSync(path.join(SITE, p), 'utf8');
  before(() => { built = siteBuild('demo'); SITE = built.dir; });
  after(() => built && built.cleanup());

  const figures = html => [...html.matchAll(/<figure class="demo-step" id="step-(\d+)"[^>]*>([\s\S]*?)<\/figure>/g)]
    .map(m => ({ n: Number(m[1]), html: m[2] }));

  test('/demo/ writes one figure per step, in the tour\'s order, each with its screen and its card', () => {
    const d = demo();
    const html = read('demo/index.html');
    const found = figures(html);
    assert.deepStrictEqual(found.map(f => f.n), d.steps.map(s => s.n), 'the figures are not the steps');
    for (const f of found) {
      const s = d.steps[f.n - 1];
      assert.match(f.html, new RegExp(`<img src="${s.image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `step ${s.n}: the screen is not the captured one`);
      assert.ok(f.html.includes(`<h2>${s.title.en}</h2>`), `step ${s.n}: the card does not carry the title`);
      assert.ok(f.html.includes(`<p>${s.body.en}</p>`), `step ${s.n}: the card does not carry the sentence`);
      assert.ok(f.html.includes(`Step ${s.n} of ${d.steps.length}`), `step ${s.n}: the count is wrong`);
      if (s.ring) assert.match(f.html, /<a class="demo-ring" href="#[a-z0-9-]+"/, `step ${s.n}: the lit element is not there`);
    }
  });

  test('the lit element and Next both lead to the next step, and the last step leads to the scan', () => {
    const found = figures(read('demo/index.html'));
    found.forEach((f, i) => {
      const next = i + 1 < found.length ? `#step-${found[i + 1].n}` : '#demo-end';
      const ring = f.html.match(/<a class="demo-ring" href="([^"]+)"/);
      if (ring) assert.strictEqual(ring[1], next, `step ${f.n}: the lit element leads to ${ring[1]}`);
      assert.match(f.html, new RegExp(`<a class="demo-next" href="${next}"`), `step ${f.n}: Next does not lead to ${next}`);
      if (i > 0) assert.match(f.html, new RegExp(`href="#step-${found[i - 1].n}"`), `step ${f.n}: Back does not lead to the step before`);
      else assert.doesNotMatch(f.html, /demo-back/, 'the first step offers a Back');
    });
    const end = read('demo/index.html').match(/<div class="demo-step demo-end" id="demo-end">([\s\S]*?)<\/div>\s*<\/div>/);
    assert.ok(end, 'no end card');
    const ctas = [...end[1].matchAll(/<a class="btn-cta" href="([^"]+)"/g)].map(m => m[1]);
    assert.deepStrictEqual(ctas, ['/#scan'], 'the end card\'s one primary action is the free scan, and nothing else (style rule 8)');
  });

  test('the opening card offers every chapter, each landing on that chapter\'s first step', () => {
    const d = demo();
    const first = figures(read('demo/index.html'))[0];
    const buttons = [...first.html.matchAll(/<a class="demo-chapter-btn ([a-z]+)" href="#step-(\d+)" data-chapter="([a-z]+)">([^<]+)<\/a>/g)]
      .map(m => ({ id: m[3], first: Number(m[2]), name: m[4] }));
    assert.deepStrictEqual(buttons, d.chapters.map(c => ({ id: c.id, first: c.first, name: c.name.en })));
    assert.doesNotMatch(first.html, /<nav\b/, 'main.css fixes every <nav> to the top of the page (#767)');
  });

  test('the homepage offers the demo under the scan field, as a line and not a second button', () => {
    const home = read('index.html');
    const door = home.match(/<p class="scan-demo" id="scanDemo"><a href="\/demo\/">([^<]+)<\/a><\/p>/);
    assert.ok(door, 'the homepage has no door to /demo/ under the scan field (#767)');
    const hero = home.match(/<section class="hero" id="scan">[\s\S]*?<\/section>/)[0];
    const buttons = [...hero.matchAll(/class="(?:btn-cta|scan-btn)"/g)].map(m => m[0]);
    assert.ok(!/class="btn-cta"[^>]*href="\/demo\/"/.test(hero), 'the demo must not be a second primary button in the hero (style rule 8)');
    assert.ok(buttons.length >= 1);
  });

  test('/demo/ is in the sitemap, and a twin says the studio\'s sentence in its own language where it holds one', () => {
    assert.match(read('sitemap.xml'), /<loc>https:\/\/prospektor\.ai\/demo\/<\/loc>/);
    const d = demo();
    for (const l of i18n.built().filter(l => l.code !== 'en')) {
      const file = path.join(SITE, l.prefix.replace(/^\//, ''), 'demo', 'index.html');
      assert.ok(fs.existsSync(file), `${l.code}: no /${l.code}/demo/ was built`);
      const html = fs.readFileSync(file, 'utf8');
      for (const s of d.steps) {
        const want = s.body[l.code] || s.body.en;
        assert.ok(html.includes(`<p>${want}</p>`), `${l.code}: step ${s.n} does not say ${JSON.stringify(want)}`);
      }
    }
  });

  test('demo.js says nothing, fetches nothing and keeps nothing on the visitor\'s device', () => {
    const js = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'js', 'demo.js'), 'utf8');
    assert.doesNotMatch(js, /\bt\(\s*['"]/, 'a sentence in demo.js would need every catalogue');
    assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/, 'the demo is a page, not a request and not a record');
  });
});
