// /learn/ — the getting-started course as pages (#742).
//
// What these guard, in the order they would break:
//   - the snapshot the pages are drawn from is the course: nine steps whose
//     four courses cover the days between them, contiguously, the way the
//     studio's own test pins `COURSES` (#1191, #1198);
//   - the hub builds, lists every lesson under its group, and ends at the free
//     scan, which is what the section is for on a marketing site;
//   - every lesson builds to its own URL with the mail's own words on it: the
//     subject as the one h1, the opener, every bullet, the close;
//   - the course is walkable in order: each page reaches the next, the last
//     reaches the hub, and nothing reaches a day that does not exist;
//   - the sitemap carries the hub and every lesson, so the pages we ask to be
//     ranked are the ones the SEO suite checks for unique titles and
//     descriptions;
//   - the coverage tool reads the lessons as surfaces, so a lesson naming a
//     button the studio has stopped saying fails by name.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { siteBuild } = require('./helpers.js');
const R = require('../tools/resources-coverage.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lessons.json'), 'utf8'));
const lessons = require('../src/_data/lessons.js')();

let SITE, built;
const read = p => fs.readFileSync(path.join(SITE, p), 'utf8');
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('/learn/', () => {
  before(() => { built = siteBuild('learn'); SITE = built.dir; });
  after(() => built && built.cleanup());

  test('the snapshot is the course: nine steps, four courses covering the days between them', () => {
    assert.strictEqual(data.lessons.length, 9);
    assert.deepStrictEqual(data.lessons.map(l => l.day), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.strictEqual(data.groups.length, 4);
    assert.ok(data.groups.every(g => g.id && g.name && g.minutes > 0), 'every course has an id, a name and its minutes');
    assert.ok(data.source && data.source.repo === 'prospektor-ai/studio' && data.fetchedAt, 'the snapshot says where and when it came from');
    let expected = 1;
    for (const g of data.groups) {
      assert.strictEqual(g.days[0], expected, `${g.name} starts at day ${g.days[0]}, expected ${expected}`);
      expected = g.days[1] + 1;
    }
    assert.strictEqual(expected, 10, 'the courses cover every day and stop at the last');
    for (const l of data.lessons) {
      assert.ok(l.subject && l.opener && l.close && l.bullets.length >= 1 && l.bullets.length <= 3, `day ${l.day} is a subject, an opener, one to three bullets and a close`);
    }
  });

  test('every lesson gets a title that fits and a description that fits', () => {
    for (const l of lessons.lessons) {
      assert.ok(l.title.length <= 60, `${l.url}: title is ${l.title.length} chars`);
      assert.ok(l.description.length <= 160 && l.description.length > 20, `${l.url}: description is ${l.description.length} chars`);
      assert.match(l.title, new RegExp(`^Day ${l.day} of 9: `));
    }
  });

  test('the hub lists every lesson under its group and ends at the free scan', () => {
    const hub = read('learn/index.html');
    for (const g of lessons.groups) assert.ok(hub.includes(`>${g.name}<`), `the hub does not head a group ${g.name}`);
    for (const l of lessons.lessons) {
      assert.ok(hub.includes(`href="${l.url}"`), `the hub does not link ${l.url}`);
      assert.ok(text(hub).includes(l.subject), `the hub does not name day ${l.day}`);
    }
    assert.ok(/href="\/#scan"/.test(hub), 'the hub does not end at the scan');
    assert.ok(lessons.minutes >= 9 && text(hub).includes(`About ${lessons.minutes} minutes in all`), 'the hub says how long the course is, from the table');
    assert.strictEqual((hub.match(/<h1\b/g) || []).length, 1);
  });

  test('every lesson builds to its own URL, in the mail\'s own words', () => {
    for (const l of lessons.lessons) {
      const file = path.join(SITE, 'learn', l.slug, 'index.html');
      assert.ok(fs.existsSync(file), `${l.url} did not build`);
      const html = fs.readFileSync(file, 'utf8');
      const plain = text(html);
      assert.strictEqual((html.match(/<h1\b/g) || []).length, 1, `${l.url}: one h1`);
      assert.ok(html.includes(`<h1 class="res-h1">${l.subject.replace(/&/g, '&amp;')}</h1>`) || plain.includes(l.subject), `${l.url}: the subject is the h1`);
      for (const line of [l.opener, ...l.bullets, l.close]) {
        assert.ok(plain.includes(line.replace(/\s+/g, ' ')), `${l.url} has lost the line: ${line}`);
      }
      assert.ok(html.includes(`href="https://studio.prospektor.ai${l.path}"`), `${l.url}: names its screen in the studio`);
      assert.ok(/href="\/#scan"/.test(html), `${l.url}: does not end at the scan`);
      assert.ok(html.includes('"@type": "BreadcrumbList"') && html.includes('"@type": "Article"'), `${l.url}: structured data`);
    }
  });

  test('the course is walkable in order: next, previous, and the hub at the end', () => {
    for (const l of lessons.lessons) {
      const html = read(path.join('learn', l.slug, 'index.html'));
      const next = lessons.lessons.find(o => o.day === l.day + 1);
      const previous = lessons.lessons.find(o => o.day === l.day - 1);
      if (next) assert.ok(html.includes(`href="${next.url}"`), `${l.url} does not reach ${next.url}`);
      else assert.ok(/learn-nav-next" href="\/learn\/"/.test(html), 'the last lesson returns to the hub');
      if (previous) assert.ok(html.includes(`href="${previous.url}"`), `${l.url} does not reach ${previous.url}`);
      assert.ok(!html.includes('/learn/day-0/') && !html.includes('/learn/day-10/'), 'no link to a day that does not exist');
    }
  });

  test('the sitemap carries the hub and every lesson', () => {
    const xml = read('sitemap.xml');
    assert.match(xml, /<loc>https:\/\/prospektor\.ai\/learn\/<\/loc>/);
    for (const l of lessons.lessons) assert.match(xml, new RegExp(`<loc>https://prospektor\\.ai${l.url.replace(/\//g, '\\/')}</loc>`), `sitemap is missing ${l.url}`);
  });

  test('the coverage tool reads the lessons as surfaces, and a lesson naming a lost button fails by name', () => {
    const surfaces = R.readLessons();
    assert.strictEqual(surfaces.length, 9);
    assert.ok(surfaces.every(s => s.kind === 'lesson' && Array.isArray(s.names) && s.text.length > 50));
    assert.ok(R.readSurfaces().filter(s => s.kind === 'lesson').length === 9, 'the real report includes them');
    const report = R.resourcesCoverage({
      snapshot: { strings: Array.from({ length: 200 }, (_, i) => `String ${i}`), fetchedAt: '2026-09-29', commit: 'abc1234' },
      corpus: [{ name: '01-getting-started.md', text: 'Nothing about it.' }],
      surfaces: [{ file: 'data/lessons.json#day-10', kind: 'lesson', slug: null, names: ['Old button'], text: 'Press Old button.' }],
      exclusions: [],
    });
    const failures = R.resourcesFailures(report);
    assert.ok(failures.some(f => f.includes('data/lessons.json#day-10') && f.includes('"Old button"')), failures.join('\n'));
  });
});
