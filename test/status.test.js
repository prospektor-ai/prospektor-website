// The status line (#980): /status/ builds, every page's footer reaches it, and
// the page is a reader of the studio's own record and nothing more.
//
// What a build can show: the page exists, is out of the index, names the
// studio's /api/status as its one source, ships the script that reads it, and
// is linked from the footer of every page in every language. What it cannot
// show is the line changing with the answer; test/drive.js §20 does that with
// the studio's endpoint answered by a stub.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { siteBuild } = require('./helpers.js');

let SITE, built;
const read = p => fs.readFileSync(path.join(SITE, p), 'utf8');
const htmlPages = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? htmlPages(path.join(dir, e.name))
    : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []);

describe('the status line', () => {
  before(() => { built = siteBuild('status'); SITE = built.dir; });
  after(() => built && built.cleanup());

  test('/status/ builds, out of the index, reading the studio and nothing else', () => {
    const html = read('status/index.html');
    assert.match(html, /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i, 'a utility page, not one to rank');
    assert.match(html, /id="status"[^>]*data-api="https:\/\/studio\.prospektor\.ai\/api\/status"/, 'one source: the studio’s own status route');
    assert.match(html, /<script src="\/assets\/js\/status\.[0-9a-f]+\.js" defer>/, 'the reader ships hashed, like every script');
    assert.match(html, /id="statusLine"/);
    assert.match(html, /id="statusNote"/);
    const sitemap = read('sitemap.xml');
    assert.ok(!sitemap.includes('/status/'), 'and the sitemap does not ask Google to rank it');
  });

  test('every built page links to /status/ from its footer, in its own language', () => {
    for (const p of htmlPages(SITE)) {
      const html = fs.readFileSync(p, 'utf8');
      if (!html.includes('<footer')) continue;
      const footer = html.slice(html.indexOf('<footer'));
      assert.match(footer, /href="\/status\/"[^>]*>(Status|Estado)</, `${path.relative(SITE, p)}: no status link in the footer`);
    }
  });

  test('the script says every state in words a person at a bad moment can act on', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'src/assets/js/status.js'), 'utf8');
    for (const line of ['Prospektor is up.', 'Prospektor is back.', 'Prospektor is degraded.', 'Prospektor is not answering.', 'No recent check.'])
      assert.ok(js.includes(line), `the script never says "${line}"`);
    assert.ok(/'unknown'/.test(js) && /as unsure, not as up/.test(js), 'a stale record reads as unsure, never as up');
    assert.ok(!/[—–]|\s--\s/.test(js), 'no dashes (the style standard, tell 1)');
    assert.ok(!/\bt\(/.test(js), 'English only: the page has no twin, so t() would only add untranslated noise');
  });
});
