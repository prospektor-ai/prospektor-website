// /resources/ tracks the product — checked, not trusted (#745).
//
// The operator's ask, 17 Sep 2026: *"yes also add /resources to the check"*,
// the check being the studio's tour coverage (#744), which fails `npm test`
// there when the one-minute tour names a screen or a button the product no
// longer says. The articles are the other half of that checkpoint and live in
// this repository, so their enforcer lives here: `tools/resources-coverage.js`
// reads every surface under /resources/, the names each declares, and the
// links each carries, against the studio's string inventory vendored as
// `data/studio-strings.json` and the help corpus snapshot.
//
// The failure modes are proven against fixtures rather than by planting a
// broken article in src/resources/, so a red test here always means the real
// section is wrong and never means the suite is testing itself. Nothing here
// counts articles, names or strings.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = require('../tools/resources-coverage.js');

const ROOT = path.join(__dirname, '..');

/** A synthetic world: a catalogue, a corpus, two articles and a hub. */
const world = (over = {}) => ({
  snapshot: { strings: Array.from({ length: 200 }, (_, i) => `String ${i}`).concat(['Call prep', 'Open For you', 'Warm paths']), fetchedAt: '2026-09-18', commit: 'abc1234' },
  corpus: [
    { name: '01-getting-started.md', text: '# Getting started\n\nThe call prep is one press.' },
    { name: '08-workspace.md', text: '# Workspace\n\nThe deck lives here.' },
  ],
  surfaces: [
    { file: 'src/resources/one.md', kind: 'article', slug: 'one', names: ['Call prep'], text: 'Press Call prep, then read [the workspace guide](/help/workspace/) and [two](/resources/two/).' },
    { file: 'src/resources/two.md', kind: 'article', slug: 'two', names: [], text: 'Method only, no product named. Back to [the hub](/resources/) and [help](/help/).' },
    { file: 'src/resources.njk', kind: 'hub', slug: null, names: ['deck'], text: 'It drafts the deck. <a href="/resources/one/">One</a>' },
  ],
  exclusions: [],
  ...over,
});

const failuresOf = over => R.resourcesFailures(R.resourcesCoverage(world(over)));

describe('the reader', () => {
  test('says: the whole phrase, its own case, on word boundaries', () => {
    assert.ok(R.says('Open For you today', 'For you'));
    assert.ok(!R.says('Open for you today', 'For you'), 'case matters: a label is a proper name');
    assert.ok(!R.says('Library holds skipped runs', 'Skip'), 'a word inside another word is not the name');
    assert.ok(R.says('(Skip)', 'Skip'));
  });

  test('slugOf is the help contract\'s rule: drop the order prefix and the extension', () => {
    assert.strictEqual(R.slugOf('08-workspace.md'), 'workspace');
    assert.strictEqual(R.slugOf('01-getting-started.md'), 'getting-started');
  });

  test('linksIn reads markdown links and hrefs into /help/ and /resources/, and nothing else', () => {
    const links = R.linksIn('See [a](/help/workspace/#anchor) and [b](/resources/two/?x=1),\n<a href="/help/">hub</a> and [c](/pricing/) and https://prospektor.ai/help/x');
    assert.deepStrictEqual(links.map(l => [l.line, l.section, l.target]), [[1, 'help', 'workspace'], [1, 'resources', 'two'], [2, 'help', null]]);
  });

  test('readSurface reads an article\'s names and text through the frontmatter parser the build uses', () => {
    const file = path.join(ROOT, 'src', 'resources', fs.readdirSync(path.join(ROOT, 'src', 'resources')).find(f => f.endsWith('.md')));
    const s = R.readSurface(file, 'article');
    assert.strictEqual(s.kind, 'article');
    assert.ok(Array.isArray(s.names), 'an article with no names: declares none, as a list');
    assert.ok(s.text.length > 200, 'the body is the text');
  });
});

describe('the check', () => {
  test('a clean world has no failures, and an article that names nothing adds nothing to check', () => {
    assert.deepStrictEqual(failuresOf(), []);
  });

  test('a declared name the product no longer says fails by name', () => {
    const f = failuresOf({ surfaces: [{ file: 'src/resources/one.md', kind: 'article', slug: 'one', names: ['Prospekt'], text: 'Press Prospekt.' }] });
    assert.strictEqual(f.length, 1);
    assert.match(f[0], /src\/resources\/one\.md names "Prospekt" and no screen, button or help guide says it any more/);
    assert.match(f[0], /studio as of 2026-09-18/);
    assert.match(f[0], /npm run strings:snapshot/);
  });

  test('a name the help corpus explains is covered even when no string says it', () => {
    const r = R.resourcesCoverage(world({ surfaces: [{ file: 'src/resources.njk', kind: 'hub', slug: null, names: ['deck'], text: 'the deck' }] }));
    assert.deepStrictEqual(r.uncovered, []);
    assert.deepStrictEqual(r.covered[0].where, ['08-workspace.md']);
  });

  test('a declared name the page itself does not say fails by name', () => {
    const f = failuresOf({ surfaces: [{ file: 'src/resources/one.md', kind: 'article', slug: 'one', names: ['Call prep'], text: 'Nothing named here.' }] });
    assert.strictEqual(f.length, 1);
    assert.match(f[0], /declares the name "Call prep" in `names:` but its own text does not say it/);
  });

  test('a help link written the numbered way fails with the slug it should have been', () => {
    const f = failuresOf({ surfaces: [{ file: 'src/resources/one.md', kind: 'article', slug: 'one', names: [], text: 'Read [this](/help/08-workspace/).\nAnd [that](/help/nowhere/).' }] });
    assert.deepStrictEqual(f, [
      'src/resources/one.md:1 links to /help/08-workspace/, and no guide in the help corpus has that address — it should be /help/workspace/.',
      'src/resources/one.md:2 links to /help/nowhere/, and no guide in the help corpus has that address.',
    ]);
  });

  test('a link to an article that does not exist fails by name', () => {
    const f = failuresOf({ surfaces: [{ file: 'src/resources.njk', kind: 'hub', slug: null, names: [], text: '<a href="/resources/gone/">x</a>' }, { file: 'src/resources/one.md', kind: 'article', slug: 'one', names: [], text: '' }] });
    assert.deepStrictEqual(f, ['src/resources.njk:1 links to /resources/gone/, and no article under src/resources/ has that address.']);
  });

  test('an exclusion needs a reason to be stale-checked: one nobody declares, or one the product says again, fails', () => {
    assert.deepStrictEqual(failuresOf({
      surfaces: [{ file: 'src/resources/one.md', kind: 'article', slug: 'one', names: ['Old button'], text: 'Press Old button.' }],
      exclusions: [{ name: 'Old button', why: 'Renamed in #999; the article is about the rename.' }],
    }), [], 'an excused name passes');
    const f = failuresOf({ exclusions: [{ name: 'Old button', why: 'nobody says it' }, { name: 'Call prep', why: 'excused but said' }] });
    assert.strictEqual(f.length, 2);
    assert.match(f[0], /still excuses "Old button", but no surface declares that name any more/);
    assert.match(f[1], /still excuses "Call prep", but the product says it again/);
  });

  test('a missing or unreadable snapshot is structural: the check says what to run rather than passing vacuously', () => {
    assert.match(failuresOf({ snapshot: null })[0], /data\/studio-strings\.json is missing.*npm run strings:snapshot/);
    assert.match(failuresOf({ snapshot: { strings: ['a'], fetchedAt: null, commit: null } })[0], /Only 1 strings in data\/studio-strings\.json/);
    assert.match(failuresOf({ corpus: [] })[0], /data\/help-corpus\.json holds no guide/);
    assert.match(failuresOf({ surfaces: [{ file: 'src/resources/one.md', kind: 'article', slug: 'one', names: 'Call prep', text: 'Call prep' }] })[0], /`names:` must be a YAML list/);
  });
});

describe('the section', () => {
  const report = R.resourcesCoverage();

  test('every name /resources/ declares is one the product says, and every link into /help/ and /resources/ names a page', () => {
    const failures = R.resourcesFailures(report);
    assert.deepStrictEqual(failures, [], '\n' + failures.map(f => '  - ' + f).join('\n') + '\n\nRun `npm run resources:coverage` for the same report.\n');
  });

  test('the snapshot says where it came from, so the report can say how old the list it read is', () => {
    assert.ok(report.snapshot, 'data/studio-strings.json is committed');
    assert.match(report.snapshot.fetchedAt || '', /^\d{4}-\d{2}-\d{2}$/);
    assert.match(report.snapshot.commit || '', /^[0-9a-f]{40}$/);
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'studio-strings.json'), 'utf8'));
    assert.strictEqual(raw.source.repo, 'prospektor-ai/studio');
    assert.strictEqual(raw.count, raw.strings.length);
  });

  test('the hub and the layout, the two surfaces that describe the product, declare what they name', () => {
    for (const kind of ['hub', 'layout']) {
      const s = report.surfaces.find(x => x.kind === kind);
      assert.ok(s && s.names.length > 0, `${kind}: the closing paragraph names the product and declares nothing`);
    }
  });
});
