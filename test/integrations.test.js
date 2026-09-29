// /integrations/ — the directory the Close page sits under (#838), and what
// binds it to the product.
//
// The hub is Close's directory shape: one card per app the studio's own
// *Connect your apps* grid holds, a mark, a name, a category and one line.
// What this file holds it to, in both directions where it can:
//
//   1. Every card leads somewhere that exists in this build — the Close page,
//      or a help guide the corpus snapshot holds. A card that points at a page
//      the build did not write is a 404 wearing a logo.
//   2. Every category word on a card is one the studio itself says
//      (data/studio-strings.json, the vendored inventory #745 reads), so a
//      category renamed in the product turns red here at the next snapshot.
//   3. The Close page links back up to the hub, and its *More integrations*
//      grid leaves Close out — a page that lists itself under "more" is the
//      kind of thing nobody notices until a customer does.
//
// Nothing here counts cards: a tenth app in the studio's grid is a card here
// and this file does not change — the #131 rule.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { siteBuild } = require('./helpers.js');
const i18n = require('../lib/i18n.js');

const HUB = 'integrations/index.html';
const CLOSE = 'integrations/close/index.html';
const text = html => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('/integrations/ — the directory, held to the product', () => {
  let built, DIR;
  before(() => { built = siteBuild('integrations'); DIR = built.dir; });
  after(() => built && built.cleanup());

  const read = p => fs.readFileSync(path.join(DIR, p), 'utf8');

  test('the hub is written, in every language the site is built in', () => {
    for (const l of i18n.built()) {
      const p = path.join(l.prefix.replace(/^\//, ''), HUB);
      assert.ok(fs.existsSync(path.join(DIR, p)), `${l.code}: ${p} was not written`);
    }
  });

  test('every card leads to a page this build wrote', () => {
    const html = read(HUB);
    const hrefs = [...html.matchAll(/class="card int-card"[\s\S]*?<a href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(hrefs.length >= 2, 'the hub has cards with links on them');
    for (const href of hrefs) {
      assert.match(href, /^\//, `${href}: a card leads into this site, never out of it`);
      const file = path.join(DIR, href.replace(/#.*$/, '').replace(/^\//, ''), 'index.html');
      assert.ok(fs.existsSync(file), `${href} leads to a page the build did not write`);
    }
  });

  test('a card that leads into a help guide names an anchor that guide has', () => {
    // The corpus decides the headings, so an anchor here is a claim about the
    // studio's help. A renamed heading fails by name rather than scrolling a
    // reader to the top of a long page.
    const html = read(HUB);
    for (const m of html.matchAll(/<a href="(\/help\/[^"#]+)#([^"]+)"/g)) {
      const guide = fs.readFileSync(path.join(DIR, m[1].replace(/^\//, ''), 'index.html'), 'utf8');
      assert.ok(guide.includes(`id="${m[2]}"`), `${m[1]} has no heading with the id ${m[2]}`);
    }
  });

  test('every category on a card is a word the studio says', () => {
    const inventory = require('../data/studio-strings.json');
    const says = new Set((inventory.strings || inventory.inventory || [])
      .map(s => typeof s === 'string' ? s : (s.key || s.text)));
    assert.ok(says.size > 100, 'the strings snapshot is empty — npm run strings:snapshot');
    const topics = [...read(HUB).matchAll(/class="card-topic">([^<]+)</g)].map(m => m[1].trim());
    assert.ok(topics.length >= 2, 'the hub has categories on its cards');
    for (const t of new Set(topics))
      assert.ok(says.has(t), `"${t}" is a category the studio does not say — its grid spells them Team chat, CRM, AI assistant, API token`);
  });

  test('Close is a card, and the card leads to the Close page', () => {
    assert.match(read(HUB), /<a href="\/integrations\/close\/"/);
    assert.match(read(path.join('es', HUB)), /<a href="\/es\/integrations\/close\/"/, 'the Spanish hub leads to the Spanish Close page');
  });

  test('the Close page links back up, and its "more" grid leaves Close out', () => {
    const html = read(CLOSE);
    assert.match(html, /class="int-back" href="\/integrations\/"/);
    const more = html.slice(html.indexOf('class="int-more"'));
    assert.ok(more.length > 100, 'the Close page carries the other integrations under it');
    assert.ok(!/href="\/integrations\/close\/"/.test(more), 'the Close page lists itself under "more integrations"');
    assert.match(more, /href="\/integrations\/"/, 'and the way to all of them');
  });

  test('every card with a mark shows a file the build serves', () => {
    // #841: the vendors' own marks, one file each under /assets/img/, which
    // the asset contract serves verbatim. A card naming a file the build did
    // not copy is a broken image beside a real name.
    const srcs = [...read(HUB).matchAll(/class="int-mark has-logo"><img src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(srcs.length >= 2, 'the hub shows marks');
    for (const src of srcs)
      assert.ok(fs.existsSync(path.join(DIR, src.replace(/^\//, ''))), `${src} is not in the build`);
  });

  test('every integration page is headed by its name, links into the help, and leaves itself out of "more"', () => {
    // #841: the operator's ask was a landing page per integration that
    // "explains the benefit of Prospektor + INTEGRATION and links to a KB
    // 'how to use it'". Derived from the hub's own cards, so a tenth page is
    // checked with nobody editing this.
    const hub = read(HUB);
    const cards = [...hub.matchAll(/class="card int-card">\s*<a href="(\/integrations\/[^"]+\/)">[\s\S]*?<h3 class="card-title">([^<]+)<\/h3>/g)];
    assert.ok(cards.length >= 2, 'the hub has cards leading to integration pages');
    for (const [, href, name] of cards) {
      const html = read(path.join(href.replace(/^\//, ''), 'index.html'));
      const h1 = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '';
      assert.strictEqual(text(h1).trim(), name.trim(), `${href} is headed "${text(h1).trim()}", the card says "${name}"`);
      const doc = (html.match(/class="btn-ghost int-doc" href="([^"]+)"/) || [])[1];
      assert.ok(doc && /^\/help\//.test(doc), `${href} has no "How to set it up" link into the help`);
      const guideFile = path.join(DIR, doc.replace(/#.*$/, '').replace(/^\//, ''), 'index.html');
      assert.ok(fs.existsSync(guideFile), `${href} links to ${doc}, which the build did not write`);
      const anchor = (doc.match(/#(.+)$/) || [])[1];
      if (anchor) assert.ok(fs.readFileSync(guideFile, 'utf8').includes(`id="${anchor}"`), `${href} links to ${doc}, and that guide has no heading with the id ${anchor}`);
      assert.match(html, /class="int-back" href="\/integrations\/"/, `${href} has no way back up`);
      const more = html.slice(html.indexOf('class="int-more"'));
      assert.ok(!more.includes(`href="${href}"`), `${href} lists itself under "more integrations"`);
      for (const l of i18n.built())
        assert.ok(fs.existsSync(path.join(DIR, l.prefix.replace(/^\//, ''), href.replace(/^\//, ''), 'index.html')), `${l.code}: ${href} was not written`);
    }
  });

  test('every page carries one way into the directory', () => {
    // The header is full (site.json measures a seventh item as an overflow),
    // so the footer is the hub's inbound link on every page.
    for (const p of ['index.html', 'pricing/index.html', 'es/index.html'])
      assert.match(read(p), /href="\/(?:es\/)?integrations\/"/, `${p} has no link to the directory`);
  });

  test('the hub says nothing about a free month unless the build arms it', () => {
    // The offer is sold on the Close page and nowhere else (#622); the hub's
    // Close card may point at it, never state it, in the dark build.
    const body = text(read(HUB));
    for (const re of [/month free/i, /free for/i, /30 days/i, /\$0 today/i])
      assert.ok(!re.test(body), `the dark hub says ${re}, and nothing would grant it`);
  });
});
