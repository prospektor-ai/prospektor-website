// /help/ — short articles, one question each (studio #1201, 7 Oct 2026).
//
// Until 7 Oct 2026 this section rendered the studio's thirteen long reference
// files, and the operator called it "horrendous AI-slop". It is now the
// studio's help ARTICLES (`docs/help/articles/`, served as `articles` by
// /api/help): a title, a dek, the steps and the facts. What these guard, in
// the order they would break:
//
//   - the reader: front matter as flat lines, the two sections by POSITION
//     (a translation says "Cómo hacerlo"), a translation's provenance line
//     dropped, and anything that is not an article refused;
//   - the built section: every article on its own URL with its own text, the
//     hub listing each one exactly once under its topic and in its order, the
//     search index embedded, nothing fetched by the browser, the next links
//     and the screens pointing at things the build wrote, the sitemap derived;
//   - the old guide URLs: every one answers 301 to a page the build wrote,
//     and nothing on the site still links to one;
//   - a studio outage never breaks a deploy: dead, lying, malformed, old (no
//     `articles` yet) and hanging studios all build from the snapshot, and no
//     snapshot at all still ships the hub;
//   - the editions (#535): /<code>/help/ exactly when the studio holds an
//     article in that language, an untranslated article written but noindex.
//
// Nothing here counts articles, topics or languages (#131): writing a
// twenty-sixth article, or a short one, never turns this red.
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const A = require('../lib/help-articles.js');
const { siteBuild, buildInto } = require('./helpers.js');

// The committed snapshot is the fixture: real articles, refreshed by
// `npm run help:snapshot` rather than by a network call inside a test.
const SNAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'help-articles.json'), 'utf8'));
const ARTICLES = A.sorted(SNAP.articles.map(f => A.articleOf(f)));

const build = (outDir, env) => buildInto(outDir, env);
const offlineSite = () => siteBuild('help');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'help-'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const bodyText = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Every address the long guides were published at, 24 Aug to 7 Oct 2026. A
// fixed fact about the past, so it is written down rather than derived.
const OLD_SLUGS = ['getting-started', 'screens', 'pitches', 'sharing', 'network', 'calls', 'outcomes',
  'workspace', 'best-practices', 'troubleshooting', 'privacy', 'connect-your-claude', 'first-visit'];

const ARTICLE = `---
title: Find a competitor’s customers
dek: They already pay for what you sell.
topic: who
order: 4
image: step-02.png
next: glance, make-it-yours, find-a-competitors-customers
---

## How to do it

1. Open **Counterprospekt** in the menu.
2. Press **Find their clients**.

## Good to know

- Nothing is guessed.
`;

describe('the reader (lib/help-articles.js)', () => {
  test('front matter is flat lines, and a dek with a colon in it is a sentence', () => {
    const p = A.parse(ARTICLE.replace('dek: They already pay for what you sell.', 'dek: One thing: the rest.'));
    assert.strictEqual(p.meta.title, 'Find a competitor’s customers');
    assert.strictEqual(p.meta.dek, 'One thing: the rest.');
    assert.match(p.body, /^## How to do it/);
  });

  test('the sections are read by position: the steps, then the facts, in any language', () => {
    for (const [steps, facts] of [['How to do it', 'Good to know'], ['Cómo hacerlo', 'Conviene saber']]) {
      const a = A.articleOf({ name: 'competitors-customers.md', text: ARTICLE.replace('How to do it', steps).replace('Good to know', facts) });
      assert.deepStrictEqual(a.sections.map(s => [s.heading, s.kind]), [[steps, 'steps'], [facts, 'facts']]);
      assert.match(a.sections[0].html, /^<ol>\s*<li>Open <strong>Counterprospekt<\/strong>/);
      assert.match(a.sections[1].html, /^<ul>/);
    }
  });

  test('an article: slug from its name, next without itself, an image only when the build holds it', () => {
    const a = A.articleOf({ name: 'find-a-competitors-customers.md', text: ARTICLE });
    assert.strictEqual(a.slug, 'find-a-competitors-customers');
    assert.deepStrictEqual(a.next, ['glance', 'make-it-yours']);
    assert.strictEqual(a.image, 'step-02.png');
    assert.strictEqual(A.articleOf({ name: 'x.md', text: ARTICLE.replace('step-02.png', 'nowhere.png') }).image, null,
      'a picture the site does not hold must not reach the asset filter, which would fail the build');
  });

  test('a translation\'s provenance line is not content', () => {
    const a = A.articleOf({ name: 'x.md', text: '<!-- source: ' + 'a'.repeat(64) + ' -->\n' + ARTICLE, language: 'es' });
    assert.strictEqual(a.title, 'Find a competitor’s customers');
    assert.strictEqual(a.language, 'es');
  });

  test('a link into /help/ inside an article stays in its edition', () => {
    const a = A.articleOf({ name: 'x.md', text: ARTICLE.replace('Nothing is guessed.', 'See [glance](/help/glance/).') }, '/es');
    assert.match(a.sections[1].html, /href="\/es\/help\/glance\/"/);
  });

  test('what is not an article is refused, by name', () => {
    assert.match(A.validate('<!doctype html>'), /not an object/);
    assert.match(A.validate({ files: [{ name: '01-x.md', text: '# X' }] }), /no articles array/, 'an older studio, with only the long files');
    assert.match(A.validate({ articles: [] }), /no articles/);
    assert.match(A.validate({ articles: [{ name: 'x.md', text: '' }] }), /x\.md had no text/);
    assert.match(A.validate({ articles: [{ name: 'x.md', text: '# X\n\nNo front matter.' }] }), /no front matter/);
    assert.match(A.validate({ articles: [{ name: 'x.md', text: ARTICLE.replace('topic: who', 'topic: elsewhere') }] }), /no known topic/);
    assert.match(A.validate({ articles: [{ name: '../x.md', text: ARTICLE }] }), /no plain name/);
    assert.strictEqual(A.validate({ articles: [{ name: 'x.md', text: ARTICLE }] }), null);
  });

  test('the snapshot is real articles, every one of them readable', () => {
    assert.strictEqual(A.validate(SNAP), null);
    for (const a of ARTICLES) assert.ok(a.sections.some(s => s.kind === 'steps'), `${a.name}: no steps`);
  });
});

describe('the built help section', () => {
  let out, hub;
  const page = slug => fs.readFileSync(path.join(out, 'help', slug, 'index.html'), 'utf8');
  before(() => {
    out = offlineSite().dir;
    hub = fs.readFileSync(path.join(out, 'help', 'index.html'), 'utf8');
  });

  test('every article has its own URL, its title once as the h1, its dek as the description, and its own text', () => {
    for (const a of ARTICLES) {
      const html = page(a.slug);
      assert.strictEqual((html.match(/<h1[\s>]/g) || []).length, 1, `${a.slug}: one h1`);
      assert.ok(html.includes(`<h1>${esc(a.title)}</h1>`), `${a.slug}: the h1 is not the article's title`);
      assert.ok(html.includes(`<meta name="description" content="${esc(a.dek)}">`), `${a.slug}: the description is not the dek`);
      const steps = bodyText(a.sections[0].html);
      assert.ok(bodyText(html).includes(steps.slice(0, 80)), `${a.slug}: the steps are not on the page`);
      assert.match(html, /<section class="hp-section hp-steps">/, `${a.slug}: no steps section`);
    }
  });

  test('an article\'s text lives on exactly one URL: the hub carries titles, never the steps', () => {
    for (const a of ARTICLES) {
      const steps = bodyText(a.sections[0].html).slice(0, 60);
      assert.equal(bodyText(hub).includes(steps), false, `${a.slug}'s steps are on the hub too`);
    }
  });

  test('the hub links every article exactly once, under its topic, in its order', () => {
    for (const a of ARTICLES) {
      const n = hub.split(`href="/help/${a.slug}/"`).length - 1;
      assert.strictEqual(n, 1, `/help/${a.slug}/ is linked ${n} times from the hub`);
    }
    for (const t of A.TOPICS.filter(t => !['start', 'account'].includes(t.key))) {
      const mine = ARTICLES.filter(a => a.topic === t.key);
      if (!mine.length) continue;
      const tile = hub.match(new RegExp(`<div class="hp-tile" id="${t.key}">[\\s\\S]*?</ul>`));
      assert.ok(tile, `no tile for ${t.key}`);
      assert.ok(tile[0].includes(`<h2>${esc(t.name)}</h2>`), `the ${t.key} tile is not headed ${t.name}`);
      const order = [...tile[0].matchAll(/href="\/help\/([a-z-]+)\/"/g)].map(m => m[1]);
      assert.deepStrictEqual(order, mine.map(a => a.slug), `the ${t.key} tile lists its articles out of order`);
    }
    const start = ARTICLES.find(a => a.topic === 'start');
    if (start) assert.match(hub, new RegExp(`<a class="hp-start" href="/help/${start.slug}/">`), 'the start card does not open the first start article');
    for (const a of ARTICLES.filter(a => a.topic === 'account'))
      assert.match(hub.slice(hub.indexOf('id="account"')), new RegExp(`href="/help/${a.slug}/"`), `${a.slug} is not among the account pills`);
  });

  test('search: the field, an index of every article\'s title and dek, and a script that asks the network only when Ask is pressed', () => {
    assert.match(hub, /<input id="helpSearch" type="search"/);
    const index = JSON.parse(hub.match(/<script type="application\/json" id="helpIndex">([\s\S]*?)<\/script>/)[1]);
    assert.deepStrictEqual(index.map(e => e.u).sort(), ARTICLES.map(a => `/help/${a.slug}/`).sort());
    for (const e of index) {
      const a = ARTICLES.find(x => `/help/${x.slug}/` === e.u);
      assert.strictEqual(e.t, a.title);
      assert.strictEqual(e.d, a.dek);
    }
    assert.match(hub, /<script src="\/assets\/js\/help-search\.[0-9a-f]+\.js" defer><\/script>/);
    const src = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'js', 'help-search.js'), 'utf8');
    assert.equal(/XMLHttpRequest|localStorage|sessionStorage|document\.cookie/.test(src), false,
      'the help search reaches for the visitor\'s device');
    // #1224: one request, the question to the studio, and only from ask().
    // Typing filters the index and asks nothing.
    assert.equal((src.match(/fetch\(/g) || []).length, 1, 'the help search makes one kind of request');
    assert.match(src, /var API = 'https:\/\/studio\.prospektor\.ai\/api\/help-ask';/);
    const askBody = src.slice(src.indexOf('function ask()'), src.indexOf("input.addEventListener('input'"));
    assert.ok(askBody.includes('fetch(API'), 'the request is made from ask() and nowhere else');
    assert.match(hub, /<button id="helpAsk" class="hp-ask" type="button" hidden>Ask<\/button>/);
  });

  test('every next link and every screen is something the build wrote', () => {
    for (const a of ARTICLES) {
      const html = page(a.slug);
      const next = html.slice(html.indexOf('class="hp-next"'));
      for (const m of next.matchAll(/class="hp-next-card" href="(\/help\/([a-z-]+)\/)"><span>([^<]*)<\/span>/g)) {
        assert.ok(fs.existsSync(path.join(out, m[1], 'index.html')), `${a.slug}: next ${m[1]} was not built`);
        assert.strictEqual(m[3], esc(ARTICLES.find(x => x.slug === m[2]).title), `${a.slug}: next ${m[1]} is not titled as its article`);
      }
      if (a.image) {
        const img = html.match(new RegExp(`<figure class="hp-shot hp-tint-${a.topic}">\\s*<img src="([^"]+)"`));
        assert.ok(img, `${a.slug}: names ${a.image} and shows no screen on its topic's panel`);
        assert.ok(fs.existsSync(path.join(out, img[1])), `${a.slug}: ${img[1]} is not in the build`);
      } else {
        assert.equal(html.includes('class="hp-shot'), false, `${a.slug}: a screen nobody asked for`);
      }
    }
  });

  test('the back link names the article\'s topic and leads to it on the hub', () => {
    for (const a of ARTICLES) {
      const t = A.TOPICS.find(x => x.key === a.topic);
      const href = a.topic === 'start' ? '/help/' : `/help/#${a.topic}`;
      assert.ok(page(a.slug).includes(`<a class="hp-back" href="${href}">‹ Help · ${esc(t.name)}</a>`), `${a.slug}: back link`);
    }
  });

  test('the new look: its own stylesheet on the help pages only, and no emoji or uppercase kicker', () => {
    const sheet = /<link rel="stylesheet" href="\/assets\/css\/help\.[0-9a-f]+\.css">/;
    assert.match(hub, sheet);
    assert.match(page(ARTICLES[0].slug), sheet);
    for (const other of ['index.html', 'pricing/index.html', 'resources/index.html'])
      assert.doesNotMatch(fs.readFileSync(path.join(out, other), 'utf8'), sheet, `${other} loads the help stylesheet`);
    for (const html of [hub, ...ARTICLES.map(a => page(a.slug))]) {
      const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
      assert.doesNotMatch(main, /class="tag"|card-emoji/, 'the old kicker or emoji card is back');
      assert.doesNotMatch(main, /\p{Extended_Pictographic}/u, 'an emoji on a help page');
    }
  });

  test('the sitemap asks for every article, derived, and for no help URL the build did not write', () => {
    const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.ok(sm.includes('<loc>https://prospektor.ai/help/</loc>'));
    for (const a of ARTICLES) assert.ok(sm.includes(`<loc>https://prospektor.ai/help/${a.slug}/</loc>`), `${a.slug} is not in the sitemap`);
    for (const m of sm.matchAll(/<loc>https:\/\/prospektor\.ai(\/(?:[a-z]{2}\/)?help\/[^<]*)<\/loc>/g))
      assert.ok(fs.existsSync(path.join(out, m[1], 'index.html')), `the sitemap asks for ${m[1]}, which the build did not write`);
  });

  test('every old guide URL answers 301 to a page the build wrote, in English and in Spanish', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    const rules = [...toml.matchAll(/\[\[redirects\]\]\s*from = "([^"]+)"\s*to = "([^"]+)"\s*status = (\d+)(\s*force = true)?/g)]
      .map(m => ({ from: m[1], to: m[2], status: Number(m[3]), force: !!m[4] }));
    const catchAll = rules.findIndex(r => r.from === '/*');
    for (const prefix of ['', '/es']) {
      for (const slug of OLD_SLUGS) {
        const i = rules.findIndex(r => r.from === `${prefix}/help/${slug}/*`);
        assert.ok(i >= 0, `no redirect for ${prefix}/help/${slug}/`);
        const r = rules[i];
        assert.ok(i < catchAll, `${r.from} sits after the 404 rule and can never answer`);
        assert.strictEqual(r.status, 301);
        assert.equal(r.force, false, `${r.from} is forced and would shadow a page`);
        assert.match(r.to, new RegExp(`^${prefix}/help/([a-z-]+/)?$`), `${r.from} leaves its edition`);
        assert.ok(fs.existsSync(path.join(out, r.to, 'index.html')) || (prefix && fs.existsSync(path.join(out, r.to.replace(/^\/es/, ''), 'index.html'))),
          `${r.from} answers ${r.to}, which the build did not write`);
        assert.equal(fs.existsSync(path.join(out, prefix, 'help', slug, 'index.html')), false, `${prefix}/help/${slug}/ is still built`);
      }
    }
    const es = rules.find(r => r.from === '/es/help/*');
    assert.ok(es && es.to === '/help/:splat' && es.status === 301 && !es.force, 'anything left under /es/help/ falls back to its English twin');
  });

  test('nothing on the site links to an old guide', () => {
    const pages = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? pages(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []);
    const old = new RegExp(`href="(?:https://prospektor\\.ai)?(?:/[a-z]{2})?/help/(?:${OLD_SLUGS.join('|')})/`);
    for (const f of pages(out)) {
      const m = fs.readFileSync(f, 'utf8').match(old);
      assert.equal(m, null, `${path.relative(out, f)} links ${m && m[0]}`);
    }
  });
});

describe('a studio outage must never break the build', () => {
  const firstSteps = () => bodyText(ARTICLES[0].sections[0].html).slice(0, 60);
  const fromSnapshot = (out, why) => assert.ok(
    bodyText(fs.readFileSync(path.join(out, 'help', ARTICLES[0].slug, 'index.html'), 'utf8')).includes(firstSteps()), why);

  const answering = async (body, fn) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': typeof body === 'string' ? 'text/html' : 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
    await new Promise(r => server.listen(0, r));
    try { await fn(`http://127.0.0.1:${server.address().port}/api/help`); } finally { server.close(); }
  };

  test('endpoint unreachable: the build succeeds from the snapshot', () => {
    const out = tmp();
    build(out, { HELP_CORPUS_OFFLINE: '', HELP_API: 'http://127.0.0.1:9/api/help', HELP_CORPUS_TIMEOUT_MS: '2000' });
    fromSnapshot(out, 'the build did not fall back to the snapshot');
  });

  test('endpoint lying: an app shell with a 200 on it is not articles', async () => {
    // The build is synchronous, so a server on this event loop cannot answer
    // it: it times out and falls back, which is what this test asserts.
    await answering('<!doctype html><title>studio</title>', url => {
      const out = tmp();
      build(out, { HELP_CORPUS_OFFLINE: '', HELP_API: url, HELP_CORPUS_TIMEOUT_MS: '1500' });
      fromSnapshot(out, 'the build did not fall back to the snapshot');
    });
  });

  test('an older studio (long files, no articles) and a malformed answer both build from the snapshot', async () => {
    const dir = tmp();
    for (const body of [
      { files: [{ name: '01-getting-started.md', text: '# Getting started\n\nWelcome.' }] },
      { articles: [{ name: 'x.md', text: '' }] },
    ]) {
      const answers = path.join(dir, 'answers.json');
      fs.writeFileSync(answers, JSON.stringify({ en: body }));
      const server = await fixtureServer(answers);
      try {
        const out = tmp();
        build(out, { HELP_CORPUS_OFFLINE: '', HELP_API: `http://127.0.0.1:${server.port}/api/help` });
        fromSnapshot(out, `the build did not fall back to the snapshot on ${JSON.stringify(body).slice(0, 40)}`);
        assert.equal(fs.existsSync(path.join(out, 'help', 'x', 'index.html')), false, 'an empty article was given a URL');
        assert.equal(fs.existsSync(path.join(out, 'help', 'getting-started', 'index.html')), false, 'a long file was published');
      } finally {
        server.kill();
      }
    }
  });

  test('no snapshot and no studio: the hub still ships, and no article URL is promised', () => {
    const snaps = fs.readdirSync(path.join(ROOT, 'data')).filter(n => /^help-articles(\.[a-z]{2})?\.json$/.test(n));
    const kept = new Map(snaps.map(n => [n, fs.readFileSync(path.join(ROOT, 'data', n))]));
    try {
      for (const n of snaps) fs.unlinkSync(path.join(ROOT, 'data', n));
      const out = tmp();
      build(out, { HELP_CORPUS_OFFLINE: '', HELP_API: 'http://127.0.0.1:9/api/help', HELP_CORPUS_TIMEOUT_MS: '2000' });
      const html = fs.readFileSync(path.join(out, 'help', 'index.html'), 'utf8');
      assert.match(html, /How can we help\?/);
      assert.match(html, /write to us/);
      assert.deepEqual(fs.readdirSync(path.join(out, 'help')), ['index.html'], 'article pages from articles the build never had');
      const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
      assert.equal(/prospektor\.ai(\/[a-z]{2})?\/help\/[a-z]/.test(sm), false, 'the sitemap asks for an article that was not built');
    } finally {
      for (const [n, bytes] of kept) fs.writeFileSync(path.join(ROOT, 'data', n), bytes);
    }
  });

  test('a studio that hangs is a failure, not a wait (#185): the build falls back on its deadline', async () => {
    const sockets = [];
    const server = http.createServer((req, res) => { sockets.push(res); });
    server.on('connection', s => sockets.push(s));
    await new Promise(r => server.listen(0, r));
    try {
      const out = tmp();
      const began = Date.now();
      build(out, { HELP_CORPUS_OFFLINE: '', HELP_API: `http://127.0.0.1:${server.address().port}/api/help`, HELP_CORPUS_TIMEOUT_MS: '1500' });
      fromSnapshot(out, 'the build did not fall back to the snapshot');
      assert.ok(Date.now() - began < 60000, 'the deadline did not end the wait');
    } finally {
      for (const s of sockets) { try { s.destroy ? s.destroy() : s.end(); } catch (e) {} }
      server.close();
    }
  });

  test('every fetch of /api/help has a deadline', () => {
    for (const f of ['src/_data/help.js', 'tools/help-snapshot.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.match(src, /signal: (control\.signal|AbortSignal\.timeout)/, `${f} fetches without a deadline`);
    }
  });
});

/* A studio in a process of its own (the build is synchronous, so a server on
   this event loop could never answer it), answering `?lang=<code>` from a JSON
   file of `{ <code>: <body> }`, English for a language the file lacks. */
function fixtureServer(answersFile) {
  const { spawn } = require('node:child_process');
  const script = `
    const http = require('node:http'), fs = require('node:fs');
    const answers = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const server = http.createServer((req, res) => {
      const lang = new URL(req.url, 'http://x').searchParams.get('lang') || 'en';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answers[lang] || answers.en));
    });
    server.listen(0, () => process.stdout.write(String(server.address().port) + '\\n'));
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, answersFile], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', d => {
      out += d;
      const m = out.match(/^(\d+)\n/);
      if (m) resolve({ port: Number(m[1]), kill: () => child.kill() });
    });
    child.on('exit', code => reject(new Error(`fixture server exited ${code}`)));
  });
}

describe('the help section in another language (#535)', () => {
  const i18n = require('../lib/i18n.js');
  const snapshotFor = code => path.join(ROOT, 'data', `help-articles.${code}.json`);
  const others = () => i18n.built().filter(l => l.code !== 'en');
  let out;
  before(() => { out = offlineSite().dir; });

  test('an edition exists exactly when the studio holds an article in the language', () => {
    for (const l of others()) {
      assert.strictEqual(fs.existsSync(path.join(out, l.code, 'help', 'index.html')), fs.existsSync(snapshotFor(l.code)),
        `${l.code}: /${l.code}/help/ and data/help-articles.${l.code}.json disagree`);
    }
  });

  test('a translated hub is the hub, in its language, over its own article pages', () => {
    for (const l of others().filter(l => fs.existsSync(snapshotFor(l.code)))) {
      const snap = JSON.parse(fs.readFileSync(snapshotFor(l.code), 'utf8'));
      const hub = fs.readFileSync(path.join(out, l.code, 'help', 'index.html'), 'utf8');
      assert.match(hub, new RegExp(`<html lang="${l.code}">`));
      assert.ok(hub.includes('<link rel="alternate" hreflang="en" href="https://prospektor.ai/help/">'), 'no hreflang to the English hub');
      for (const f of snap.articles) {
        const a = A.articleOf(f, l.prefix);
        assert.strictEqual(hub.split(`href="${l.prefix}/help/${a.slug}/"`).length - 1, 1, `the ${l.code} hub links ${a.slug} once`);
        const html = fs.readFileSync(path.join(out, l.code, 'help', a.slug, 'index.html'), 'utf8');
        assert.match(html, new RegExp(`<html lang="${l.code}">`), `${a.slug}: lang`);
        assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="https://prospektor.ai/help/${a.slug}/">`), `${a.slug}: no hreflang to its English twin`);
        if (a.language === l.code) {
          assert.ok(html.includes(`<h1>${esc(a.title)}</h1>`), `${a.slug}: the h1 is not the translated title`);
          assert.doesNotMatch(html, /name="robots" content="noindex/, `${a.slug}: a translated article must be indexable`);
          assert.doesNotMatch(html, /class="hp-note"/, `${a.slug}: says it is not translated`);
        }
        const back = html.match(/class="hp-back" href="([^"]+)"/)[1];
        assert.ok(back.startsWith(`${l.prefix}/help/`), `${a.slug}: the back link leaves the edition`);
      }
      const en = fs.readFileSync(path.join(out, 'help', 'index.html'), 'utf8');
      assert.ok(en.includes(`<link rel="alternate" hreflang="${l.code}" href="https://prospektor.ai${l.prefix}/help/">`), `/help/ does not name ${l.prefix}/help/`);
    }
  });

  test('the sitemap lists every translated article page and no untranslated one', () => {
    const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    for (const l of others().filter(l => fs.existsSync(snapshotFor(l.code)))) {
      const snap = JSON.parse(fs.readFileSync(snapshotFor(l.code), 'utf8'));
      for (const f of snap.articles) {
        const loc = `<loc>https://prospektor.ai${l.prefix}/help/${A.slugOf(f.name)}/</loc>`;
        assert.strictEqual(sm.includes(loc), (f.language || 'en') === l.code, `sitemap and edition disagree about ${loc}`);
      }
      assert.ok(sm.includes(`<loc>https://prospektor.ai${l.prefix}/help/</loc>`), `${l.prefix}/help/ left the sitemap`);
    }
  });

  test('the live answer wins; an article it holds in English is written, marked, noindex and out of the sitemap', async () => {
    // A studio whose Spanish answer translates one article and falls back to
    // English on the rest: an edition, with one indexable page.
    const en = SNAP.articles.map(f => ({ ...f, language: 'en' }));
    const [one, other] = [en[0], en[1]];
    const es = en.map(f => f.name === one.name
      ? { name: f.name, text: f.text.replace(/^title: .*$/m, 'title: Un artículo en español'), language: 'es' } : f);
    const answers = path.join(tmp(), 'answers.json');
    fs.writeFileSync(answers, JSON.stringify({ en: { articles: en }, es: { articles: es } }));
    const server = await fixtureServer(answers);
    try {
      const dir = tmp();
      build(dir, { HELP_CORPUS_OFFLINE: '', HELP_API: `http://127.0.0.1:${server.port}/api/help` });
      const slug = A.slugOf(one.name), fallback = A.slugOf(other.name);
      assert.match(fs.readFileSync(path.join(dir, 'es', 'help', slug, 'index.html'), 'utf8'), /<h1>Un artículo en español<\/h1>/, 'the live answer was not used');
      const page = path.join(dir, 'es', 'help', fallback, 'index.html');
      assert.ok(fs.existsSync(page), 'the untranslated article lost its Spanish URL; a reader following the hub would 404');
      const html = fs.readFileSync(page, 'utf8');
      assert.match(html, /class="hp-note"/, 'the not-yet-translated note is missing');
      assert.match(html, /<div class="hp-body" lang="en">/, 'the English body is not marked as English');
      assert.match(html, /name="robots" content="noindex/, 'an English body on a Spanish URL is offered to search');
      const sm = fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8');
      assert.equal(sm.includes(`/es/help/${fallback}/`), false, 'the sitemap asks for a page that declines to be indexed');
      assert.ok(sm.includes(`<loc>https://prospektor.ai/es/help/${slug}/</loc>`), 'the translated article left the sitemap');
      assert.match(fs.readFileSync(path.join(dir, 'es', 'help', 'index.html'), 'utf8'), new RegExp(`href="/es/help/${fallback}/" lang="en"`),
        'the hub does not mark the English article as English');
      // Untranslated is reported, never red: German answered all English and got no edition.
      assert.equal(fs.existsSync(path.join(dir, 'de', 'help')), false, 'a language with no translated article got a hub of English text');
    } finally {
      server.kill();
    }
  });
});
