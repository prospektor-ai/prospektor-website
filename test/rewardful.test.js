// The partner programme, rented from Rewardful and dark (#885, out of #87).
//
// The operator's condition, 29 Sep 2026: build it, and show *Coming soon*
// until they have onboarded with Rewardful and have paying customers. So the
// one test that matters is the absent-key one: with no REWARDFUL_API_KEY the
// served pages must be what they were — no third-party script, no handoff for
// one, no cookie declared, no `client_reference_id` on a Checkout Session,
// and /partners/ one line long. The lit build is then proven to be the
// opposite of each of those, from the same process, so the switch is known
// to switch.
//
// Nothing here counts pages, scripts or terms (#131): a page added to the site
// can only turn this red by carrying Rewardful while the key is absent.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildInto, siteBuild } = require('./helpers.js');
const { rewardfulKey, signupUrl, referralOf, SCRIPT_SRC } = require('../lib/rewardful.js');

const ROOT = path.join(__dirname, '..');
const KEY = 'rwf-test-key-885';
const SIGNUP = 'https://prospektor.getrewardful.com/signup';

const htmlFiles = dir => {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) out.push(p);
    }
  }(dir));
  return out.sort();
};
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

describe('lib/rewardful.js — the switch and the marker', () => {
  test('the programme is dark with no key, and with a key that is not the shape of one', () => {
    assert.equal(rewardfulKey({}), '');
    assert.equal(rewardfulKey({ REWARDFUL_API_KEY: '' }), '');
    assert.equal(rewardfulKey({ REWARDFUL_API_KEY: '   ' }), '');
    for (const bad of ['<script>', 'abc', 'a b c d', 'key"onload="x', 'x'.repeat(65), 'ключ-1234'])
      assert.equal(rewardfulKey({ REWARDFUL_API_KEY: bad }), '', `${JSON.stringify(bad)} must not light the programme`);
    assert.equal(rewardfulKey({ REWARDFUL_API_KEY: KEY }), KEY);
  });

  test('the signup link is an https URL or nothing', () => {
    assert.equal(signupUrl({}), '');
    assert.equal(signupUrl({ REWARDFUL_SIGNUP_URL: 'http://prospektor.getrewardful.com/signup' }), '');
    assert.equal(signupUrl({ REWARDFUL_SIGNUP_URL: 'javascript:alert(1)' }), '');
    assert.equal(signupUrl({ REWARDFUL_SIGNUP_URL: 'not a url' }), '');
    assert.equal(signupUrl({ REWARDFUL_SIGNUP_URL: SIGNUP }), SIGNUP);
  });

  test('a referral is a marker in Stripe\'s client_reference_id shape, and never a person', () => {
    assert.equal(referralOf('bffa8b94-b25a-45a4-97a0-1c8ecb8018b9'), 'bffa8b94-b25a-45a4-97a0-1c8ecb8018b9');
    assert.equal(referralOf(' abc_123 '), 'abc_123');
    for (const bad of ['', ' ', 'mara@ledgerpost.example', 'Mara Voss', 'acme.com', 'a'.repeat(201), null, undefined, 42, {}, 'x;y'])
      assert.equal(referralOf(bad), '', `${JSON.stringify(bad)} is not a marker`);
  });

  test('the script is Rewardful\'s and the loader agrees on the bytes', () => {
    assert.equal(SCRIPT_SRC, 'https://r.wdfl.co/rw.js');
    const consent = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'js', 'consent.js'), 'utf8');
    assert.ok(consent.includes(`var REWARDFUL_SRC = '${SCRIPT_SRC}';`), 'consent.js must load exactly the script lib/rewardful.js names');
  });
});

describe('the dark build — the one that matters', () => {
  let site;
  before(() => { site = siteBuild('rewardful-dark'); });
  after(() => site.cleanup());

  test('no page carries Rewardful: no script, no handoff, no key', () => {
    const carrying = [];
    for (const f of htmlFiles(site.dir)) {
      const html = fs.readFileSync(f, 'utf8');
      if (/wdfl\.co|ppsc-gated-rewardful|data-rewardful|_rwq/.test(html)) carrying.push(path.relative(site.dir, f));
    }
    assert.deepEqual(carrying, [], 'pages carrying Rewardful while the key is absent');
  });

  test('/partners/ is one line, Coming soon, noindex and out of the sitemap', () => {
    const html = read(site.dir, 'partners/index.html');
    assert.match(html, /<h1 class="page-h1">Coming soon\.<\/h1>/);
    assert.ok(!/partner-terms|Sign up as a partner|getrewardful/.test(html), 'the dark page must carry no terms and no link');
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
    assert.ok(!read(site.dir, 'sitemap.xml').includes('/partners/'), 'a noindex page must not be in the sitemap');
  });

  test('every page links to /partners/ from the footer, so it is not an orphan', () => {
    const html = read(site.dir, 'index.html');
    assert.match(html, /<footer>[\s\S]*href="\/partners\/"[\s\S]*<\/footer>/);
  });

  test('a malformed key builds the same bytes as no key at all', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewardful-badkey-'));
    try {
      buildInto(dir, { REWARDFUL_API_KEY: '<script>alert(1)</script>', REWARDFUL_SIGNUP_URL: SIGNUP, HELP_CORPUS_OFFLINE: '1' });
      const a = htmlFiles(site.dir).map(f => path.relative(site.dir, f));
      const b = htmlFiles(dir).map(f => path.relative(dir, f));
      assert.deepEqual(b, a, 'the same set of pages');
      const differing = a.filter(rel => read(site.dir, rel) !== read(dir, rel));
      assert.deepEqual(differing, [], 'pages whose bytes a refused key changed');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the lit build — the switch switches', () => {
  let dir;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewardful-lit-'));
    buildInto(dir, { REWARDFUL_API_KEY: KEY, REWARDFUL_SIGNUP_URL: SIGNUP, HELP_CORPUS_OFFLINE: '1' });
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('every page carries the inert handoff, and none a live Rewardful tag', () => {
    const missing = [], live = [];
    for (const f of htmlFiles(dir)) {
      const html = fs.readFileSync(f, 'utf8');
      const rel = path.relative(dir, f);
      const m = html.match(/<script type="application\/json" id="ppsc-gated-rewardful">([^<]+)<\/script>/);
      if (!m) { missing.push(rel); continue; }
      const handoff = JSON.parse(m[1]);
      assert.deepEqual(handoff, { src: SCRIPT_SRC, 'data-rewardful': KEY }, rel);
      // The handoff sits in the head, after the gate that reads it.
      assert.ok(html.indexOf('consent') < html.indexOf('ppsc-gated-rewardful'), `${rel}: the gate must be in place before its handoff`);
      if (/<script\b[^>]*\ssrc=["']https:\/\/r\.wdfl\.co/.test(html)) live.push(rel);
    }
    assert.deepEqual(missing, [], 'pages with no handoff while the key is set');
    assert.deepEqual(live, [], 'pages serving Rewardful as a live tag — only consent may create it');
  });

  test('/partners/ carries the seven terms, the signup link, and is indexable and in the sitemap', () => {
    const html = read(dir, 'partners/index.html');
    assert.match(html, /<h1 class="page-h1">Refer a client, earn 20% for a year\.<\/h1>/);
    assert.equal((html.match(/<ol class="partner-terms">[\s\S]*?<\/ol>/)[0].match(/<li>/g) || []).length, 7);
    assert.match(html, new RegExp(`<a class="btn-cta" href="${SIGNUP.replace(/[/.]/g, '\\$&')}" rel="noopener">Sign up as a partner</a>`));
    assert.ok(!/Coming soon/.test(html));
    assert.ok(!/name="robots"/.test(html), 'the lit page indexes');
    assert.match(read(dir, 'sitemap.xml'), /<loc>https:\/\/prospektor\.ai\/partners\/<\/loc>/);
    // The numbers the page quotes are the ones #886 sets in Rewardful.
    assert.match(html, /20%/); assert.match(html, /twelve months/); assert.match(html, /thirty days/);
  });

  test('with the key set and no signup URL, the way in is our address', () => {
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'rewardful-nolink-'));
    try {
      buildInto(d2, { REWARDFUL_API_KEY: KEY, HELP_CORPUS_OFFLINE: '1' });
      const html = read(d2, 'partners/index.html');
      assert.ok(!/getrewardful|Sign up as a partner/.test(html));
      assert.match(html, /<a href="mailto:hello@prospektor\.ai">hello@prospektor\.ai<\/a> and we send you your link/);
      assert.ok(/partner-terms/.test(html), 'the terms are there either way');
    } finally {
      fs.rmSync(d2, { recursive: true, force: true });
    }
  });
});

describe('the privacy notice moves with the feature', () => {
  const privacy = fs.readFileSync(path.join(ROOT, 'src', 'privacy.njk'), 'utf8');
  test('§08 names Rewardful as a recipient, dark, with what it gets once on', () => {
    assert.match(privacy, /<td>Rewardful<\/td>\s*<td>Nothing today\. The partner programme is switched off/);
    assert.match(privacy, /Rewardful Inc\., based in Calgary, Canada/);
  });
  test('the website section names the cookie, its lifetime, and the gate', () => {
    assert.match(privacy, /<code>rewardful\.referral<\/code>/);
    assert.match(privacy, /kept 60 days/);
    assert.match(privacy, /<strong>It does not run unless you allow marketing<\/strong>/);
  });
  test('the cookie panel says the same lifetime the notice does', () => {
    const consent = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'js', 'consent.js'), 'utf8');
    assert.match(consent, /id: 'rewardful\.referral'[\s\S]*?retention: t\('60 days'\)/);
  });
});
