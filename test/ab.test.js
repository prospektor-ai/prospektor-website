// The homepage tiles test (studio #1185): drawings or photos, counted per
// version as daily totals. What these hold, in the order they would break:
//
//   - the counter accepts exactly the eight version/event pairs and nothing
//     else, answers GET with 405, counts only beacons from prospektor.ai,
//     stops counting at the day's cap, fails closed when the store is down,
//     and never writes any part of the request but the pair into the store;
//   - with the photos absent (today), the homepage ships no coin, no beacon
//     script and no photo markup, in any language;
//   - with four photos present, the coin is in <head> before the stylesheet,
//     the beacon script is deferred, and every tile carries both the drawing
//     and a sized, lazy photo;
//   - a photo Nils commits is a landscape JPEG of a sane weight, and a set of
//     one to three photos says the test is still off;
//   - the report's z-test is the textbook one.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { siteBuild, buildInto } = require('./helpers.js');
const fn = require('../netlify/functions/ab.js');
const abtest = require('../src/_data/abtest.js');
const { zTest } = require('../tools/ab-report.js');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://prospektor.ai';

const memStore = () => {
  const m = new Map(); const tags = new Map(); let n = 0;
  return {
    m,
    getWithMetadata: async k => (m.has(k) ? { data: m.get(k), etag: tags.get(k) } : null),
    set: async (k, value, cond = {}) => {
      if (cond.onlyIfNew && m.has(k)) return { modified: false };
      if (cond.onlyIfMatch && cond.onlyIfMatch !== tags.get(k)) return { modified: false };
      m.set(k, value); tags.set(k, 'e' + (++n));
      return { modified: true, etag: tags.get(k) };
    },
  };
};
const down = { getWithMetadata: async () => { throw new Error('store down'); }, set: async () => { throw new Error('store down'); } };

const beacon = (body, headers = { origin: ORIGIN }) => fn.handler({
  httpMethod: 'POST',
  headers,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const today = () => new Date().toISOString().slice(0, 10);

describe('the counter (netlify/functions/ab.js)', () => {
  let store;
  beforeEach(() => { store = memStore(); fn._setStoreForTests(store); });
  after(() => fn._setStoreForTests(undefined));

  test('counts each of the eight version/event pairs, once each', async () => {
    for (const v of fn.ARMS) for (const e of fn.EVENTS) {
      const r = await beacon({ v, e });
      assert.equal(r.statusCode, 204, `${v}/${e}`);
    }
    const day = JSON.parse(store.m.get(today()));
    assert.deepStrictEqual(day, {
      draw: { view: 1, scan: 1, demo: 1, signup: 1 },
      photo: { view: 1, scan: 1, demo: 1, signup: 1 },
    });
  });

  test('anything but exactly {v, e} from the two lists is a 400, and counts nothing', async () => {
    const bad = [
      '', 'not json', 'null', '[]', '"view"', '{}',
      { v: 'draw' }, { e: 'view' },
      { v: 'photos', e: 'view' }, { v: 'draw', e: 'click' },
      { v: 'DRAW', e: 'view' }, { v: 'draw', e: 'view', id: 'abc' },
      { v: ['draw'], e: 'view' }, { v: 'draw', e: { x: 1 } },
      { v: 'draw', e: 'view', pad: 'x'.repeat(300) },
      { v: '__proto__', e: 'view' }, { v: 'draw', e: 'constructor' },
    ];
    for (const b of bad) {
      const r = await beacon(b);
      assert.equal(r.statusCode, 400, JSON.stringify(b));
    }
    assert.equal(store.m.size, 0);
  });

  test('GET, and every other method, is a 405: there is no public readout', async () => {
    for (const m of ['GET', 'PUT', 'DELETE', 'HEAD']) {
      const r = await fn.handler({ httpMethod: m, headers: { origin: ORIGIN } });
      assert.equal(r.statusCode, 405, m);
    }
    assert.equal(store.m.size, 0);
  });

  test('a beacon from anywhere but prospektor.ai counts nothing', async () => {
    for (const headers of [{}, { origin: 'https://evil.example' }, { origin: 'https://deploy-preview-9--prospektor.netlify.app' }, { origin: 'http://prospektor.ai' }, { origin: 'null' }]) {
      const r = await beacon({ v: 'draw', e: 'view' }, headers);
      assert.equal(r.statusCode, 403, JSON.stringify(headers));
    }
    assert.equal(store.m.size, 0);
    assert.equal((await beacon({ v: 'draw', e: 'view' }, { Origin: 'https://www.prospektor.ai' })).statusCode, 204);
  });

  test('past the daily cap it answers 204 and counts nothing', async () => {
    const full = { draw: { view: fn.DAILY_CAP, scan: 0, demo: 0, signup: 0 }, photo: { view: 0, scan: 0, demo: 0, signup: 0 } };
    await store.set(today(), JSON.stringify(full));
    const r = await beacon({ v: 'photo', e: 'scan' });
    assert.equal(r.statusCode, 204);
    assert.deepStrictEqual(JSON.parse(store.m.get(today())), full);
  });

  test('a store that cannot be reached fails closed: 503, nothing counted, no detail leaked', async () => {
    fn._setStoreForTests(down);
    const r = await beacon({ v: 'draw', e: 'view' });
    assert.equal(r.statusCode, 503);
    assert.ok(!String(r.body).includes('store down'));
  });

  test('a lost race is retried on the fresh count, never written over it', async () => {
    let raced = false;
    const racy = {
      ...store,
      getWithMetadata: async k => {
        const got = await store.getWithMetadata(k);
        if (!raced) { raced = true; await store.set(k, JSON.stringify({ draw: { view: 5 }, photo: {} })); }
        return got;
      },
    };
    fn._setStoreForTests(racy);
    assert.equal((await beacon({ v: 'draw', e: 'view' })).statusCode, 204);
    assert.equal(JSON.parse(store.m.get(today())).draw.view, 6);
  });

  test('a damaged day is left alone rather than reset to zero', async () => {
    await store.set(today(), '{not json');
    assert.equal((await beacon({ v: 'draw', e: 'view' })).statusCode, 503);
    assert.equal(store.m.get(today()), '{not json');
  });

  test('nothing from the request but the pair reaches the store', async () => {
    const headers = {
      origin: ORIGIN,
      'x-nf-client-connection-ip': '203.0.113.77',
      'x-forwarded-for': '198.51.100.23',
      'user-agent': 'UA-MARKER/1.0',
      referer: 'https://prospektor.ai/?utm_source=REF-MARKER',
      cookie: 'COOKIE-MARKER=1',
    };
    await beacon({ v: 'photo', e: 'signup' }, headers);
    assert.deepStrictEqual([...store.m.keys()], [today()]);
    const stored = store.m.get(today());
    for (const marker of ['203.0.113.77', '198.51.100.23', 'UA-MARKER', 'REF-MARKER', 'COOKIE-MARKER', 'prospektor.ai'])
      assert.ok(!stored.includes(marker), `${marker} reached the store`);
    assert.deepStrictEqual(Object.keys(JSON.parse(stored)).sort(), ['draw', 'photo']);
    const src = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'ab.js'), 'utf8');
    assert.ok(!/x-nf-client-connection-ip|x-forwarded-for|user-agent|referer/i.test(src),
      'ab.js reads a header that identifies a visitor');
  });

  test('a base64 body, as Netlify can hand one over, is read the same way', async () => {
    const r = await fn.handler({ httpMethod: 'POST', headers: { origin: ORIGIN }, isBase64Encoded: true,
      body: Buffer.from(JSON.stringify({ v: 'draw', e: 'demo' })).toString('base64') });
    assert.equal(r.statusCode, 204);
    assert.equal(JSON.parse(store.m.get(today())).draw.demo, 1);
  });
});

const homepages = dir => ['', 'de', 'es', 'nl']
  .map(c => path.join(dir, c, 'index.html'))
  .filter(f => fs.existsSync(f));

describe('photos absent: the homepage is the page it was', () => {
  let built;
  before(() => { built = siteBuild('ab-off'); });
  after(() => built && built.cleanup());

  test('the data file says off while the photos are missing', () => {
    const have = abtest.TILES.filter(n => fs.existsSync(path.join(abtest.DIR, n + '.jpg')));
    if (have.length === 4) return; // the photos have landed; the next block holds them
    assert.equal(abtest.enabled, false);
  });

  test('no coin, no beacon script and no photo on any homepage', () => {
    if (abtest.enabled) return;
    const pages = homepages(built.dir);
    assert.ok(pages.length >= 1, 'no homepage was built');
    for (const p of pages) {
      const html = fs.readFileSync(p, 'utf8');
      assert.ok(!/dataset\.v|data-v=/.test(html), `${p} carries the coin`);
      assert.ok(!/\/assets\/js\/ab\./.test(html), `${p} loads the beacon script`);
      assert.ok(!/class="pphoto"/.test(html), `${p} carries a photo`);
      assert.ok(!/sendBeacon|functions\/ab/.test(html), `${p} beacons`);
      assert.ok(/class="pvis pvis-1"/.test(html), `${p} lost its drawings`);
    }
  });
});

// A JPEG with a start-of-frame marker and nothing to look at, which is all the
// build reads from one.
function fakeJpeg(width, height, pad = 0) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0); sof.writeUInt16BE(17, 2); sof[4] = 8;
  sof.writeUInt16BE(height, 5); sof.writeUInt16BE(width, 7); sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(pad), Buffer.from([0xff, 0xd9])]);
}

describe('photos present: both versions render, and the coin is tossed before paint', () => {
  let dir, out;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-on-src-'));
    const skip = new Set(['node_modules', '_site', '.git']);
    for (const name of fs.readdirSync(ROOT)) {
      if (skip.has(name)) continue;
      fs.cpSync(path.join(ROOT, name), path.join(dir, name), { recursive: true });
    }
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    const tiles = path.join(dir, 'src', 'assets', 'img', 'tiles');
    fs.mkdirSync(tiles, { recursive: true });
    for (const n of abtest.TILES) fs.writeFileSync(path.join(tiles, n + '.jpg'), fakeJpeg(1200, 800));
    out = path.join(dir, '_out');
    const { execFileSync } = require('node:child_process');
    try {
      execFileSync(path.join(ROOT, 'node_modules', '.bin', 'eleventy'), ['--quiet', '--output=' + out], {
        cwd: dir, stdio: 'pipe', env: { ...process.env, HELP_CORPUS_OFFLINE: '1' },
      });
    } catch (err) {
      throw new Error('eleventy build with photos failed:\n' + [err.stderr, err.stdout].filter(Boolean).join('\n'));
    }
  });
  after(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

  test('every homepage tosses the coin in <head>, before the stylesheet', () => {
    for (const p of homepages(out)) {
      const html = fs.readFileSync(p, 'utf8');
      const head = html.slice(0, html.indexOf('</head>'));
      const coin = head.indexOf('document.documentElement.dataset.v=Math.random()');
      assert.ok(coin > -1, `${p} has no coin in <head>`);
      assert.ok(coin < head.indexOf('rel="stylesheet"'), `${p} tosses the coin after the stylesheet`);
      assert.ok(!/localStorage|sessionStorage|cookie|indexedDB/i.test(head.slice(coin, head.indexOf('</script>', coin))), 'the coin stores something');
    }
  });

  test('the beacon script is loaded, deferred, after signup.js', () => {
    for (const p of homepages(out)) {
      const html = fs.readFileSync(p, 'utf8');
      const tag = html.match(/<script src="(\/assets\/js\/ab\.[0-9a-f]+\.js)"([^>]*)><\/script>/);
      assert.ok(tag, `${p} does not load ab.js`);
      assert.match(tag[2], /\bdefer\b/);
      assert.ok(fs.existsSync(path.join(out, tag[1])));
      assert.ok(html.indexOf(tag[0]) > html.indexOf('/assets/js/signup.'), 'ab.js must run after signup.js');
    }
  });

  test('each of the four tiles carries its drawing and a sized, lazy photo with alt text', () => {
    for (const p of homepages(out)) {
      const html = fs.readFileSync(p, 'utf8');
      const imgs = [...html.matchAll(/<div class="pphoto"><img ([^>]+)><\/div>/g)].map(m => m[1]);
      assert.equal(imgs.length, 4, `${p}: ${imgs.length} photos`);
      abtest.TILES.forEach((n, i) => {
        const a = imgs[i];
        assert.match(a, new RegExp(`src="/assets/img/tiles/${n}\\.jpg"`));
        assert.match(a, /width="1200"/); assert.match(a, /height="800"/);
        assert.match(a, /loading="lazy"/); assert.match(a, /decoding="async"/);
        assert.match(a, /alt="[^"]{12,}"/);
      });
      for (let i = 1; i <= 4; i++) assert.ok(html.includes(`class="pvis pvis-${i}"`), `${p} lost drawing ${i}`);
      assert.ok(fs.existsSync(path.join(out, 'assets', 'img', 'tiles', 'who.jpg')));
    }
  });

  test('only the homepage takes part', () => {
    const pricing = fs.readFileSync(path.join(out, 'pricing', 'index.html'), 'utf8');
    assert.ok(!/dataset\.v|\/assets\/js\/ab\./.test(pricing));
  });

  test('the stylesheet shows one or the other by data-v', () => {
    const css = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'css', 'main.css'), 'utf8');
    assert.match(css, /\.pphoto\s*\{[^}]*display:\s*none/);
    assert.match(css, /html\[data-v="photo"\] \.pphoto\s*\{[^}]*display:\s*block/);
    assert.match(css, /html\[data-v="photo"\] \.pvis\s*\{[^}]*display:\s*none/);
  });
});

describe('the photos Nils commits', () => {
  const present = abtest.TILES.filter(n => fs.existsSync(path.join(abtest.DIR, n + '.jpg')));

  test('all four or none: a partial set leaves the test off', () => {
    assert.ok(present.length === 0 || present.length === 4,
      `${present.length} of the 4 tile photos are in src/assets/img/tiles (${present.join(', ')}); the test stays off until all four are`);
  });

  test('each is a landscape JPEG under 250 KB', () => {
    for (const n of present) {
      const buf = fs.readFileSync(path.join(abtest.DIR, n + '.jpg'));
      const size = abtest.jpegSize(buf);
      assert.ok(size, `${n}.jpg is not a JPEG the build can read`);
      assert.ok(size.width > size.height, `${n}.jpg is ${size.width}x${size.height}; the tile wants landscape`);
      assert.ok(buf.length <= 250 * 1024, `${n}.jpg is ${Math.round(buf.length / 1024)} KB; keep it under about 200 KB`);
    }
  });

  test('the size reader reads a JPEG and refuses anything else', () => {
    assert.deepStrictEqual(abtest.jpegSize(fakeJpeg(1200, 800)), { width: 1200, height: 800 });
    assert.equal(abtest.jpegSize(Buffer.from('\x89PNG\r\n\x1a\n')), null);
    assert.equal(abtest.jpegSize(Buffer.alloc(0)), null);
  });
});

describe('the report (tools/ab-report.js)', () => {
  test('the z-test matches a worked example', () => {
    // 100/1000 against 130/1000: pooled p = .115, se = .014267, z = 2.103.
    const t = zTest(100, 1000, 130, 1000);
    assert.ok(Math.abs(t.z - 2.103) < 0.01, String(t.z));
    assert.ok(t.pValue < 0.05 && t.pValue > 0.03, String(t.pValue));
    assert.equal(zTest(0, 0, 1, 10), null);
    assert.equal(zTest(0, 10, 0, 10), null);
  });

  test('the report reads the website, never the studio site NETLIFY_SITE_ID names', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'ab-report.js'), 'utf8');
    assert.ok(!/NETLIFY_SITE_ID/.test(src.replace(/^\/\/.*$/gm, '')), 'NETLIFY_SITE_ID is the studio\'s site here');
  });
});
