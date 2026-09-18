#!/usr/bin/env node
'use strict';
// Resources coverage (#745) — makes /resources/ track the product.
//
// The operator's ask, 17 Sep 2026, answering #744's open scope line: *"yes
// also add /resources to the check"*. #744 is the studio's `dev/tour-coverage.js`:
// a meaningful change to the product updates the tour, checked rather than
// remembered, in the family of `dev/help-coverage.js` (#146) and
// `dev/course-coverage.js` (#545). The website's articles are the other half
// of the same checkpoint and had no check at all: #721 found the welcome mail
// describing a first minute the product had not had since August, and #649
// removed 52 writer-voice tells by hand from articles nothing was watching.
//
// Why the check lives here and not in the studio: the studio's `npm test`
// runs in a checkout that does not hold this repository, and Netlify builds
// the studio without it, so a studio-side test that read a sibling checkout
// would be green on a laptop and hollow in the build (the studio's
// `test/privacy-claims.test.js` is the precedent, and it pins sentences
// instead). One checkpoint, two enforcers, each reading what its own build
// can see.
//
// What this does, in the siblings' shape:
//
// - **Each name a surface declares must still be something the product
//   says.** A surface is an article under `src/resources/`, the hub
//   (`src/resources.njk`) or the article layout's aside
//   (`src/_includes/article.njk`); it declares the screens, buttons and verbs
//   it names in `names:` in its frontmatter. The catalogue is the studio's
//   `dev/i18n-strings.js#inventory()`, vendored as `data/studio-strings.json`
//   by `npm run strings:snapshot` (that file says why vendored), plus the help
//   corpus snapshot `data/help-corpus.json`, exactly as the studio's checks
//   read `docs/help/`: a thing the help explains exists even when its label
//   is drawn some other way.
// - **A declared name must appear in the surface's own text.** `names` is
//   the surface's index of what it teaches, and an index that has stopped
//   matching the page checks nothing.
// - **Every `/help/…` and `/resources/…` link names a page.** The help slugs
//   are derived from the corpus snapshot's filenames by the one rule
//   `src/_data/help.js` applies (drop the order prefix and the extension),
//   the article slugs from the files under `src/resources/`. A link written
//   the numbered way (`/help/08-workspace/`) carries the slug it should have
//   been, the way `dev/help-links.js` does, so the report reads as a patch.
//   `test/pages.test.js` asks the same of every built page; this asks it of
//   the sources, without a build, so `npm run resources:coverage` is the
//   whole answer on its own.
//
// Three choices carried over from the siblings, for the same reasons.
//
// 1. **The names are declared, not parsed out of the prose.** A parse would
//    have to guess which capitalised phrase is a button and which is a
//    sentence's first word, and a check that guesses is a check that gets
//    deleted. `names:` is optional: twenty-six articles are about method and
//    name nothing of the product, and a check that demanded an empty list on
//    each of them would be friction pointing away from the defect (#131).
// 2. **A declared name must be in the surface's own words** (above).
// 3. **Names match case-sensitively, at word boundaries.** *Library* is a
//    rail row; *library* is a word in a sentence. The help corpus is prose
//    and says *call prep* in lowercase, so a lowercase name a reader meets
//    in the corpus is covered by the corpus.
//
// The honest floor, stated once, and it is the siblings' floor: the bar is
// that the name still exists *somewhere* a customer can meet it, not that it
// still labels the thing the article is describing; and an article that
// names a button without declaring it is not caught. What it catches is the
// common half, a name the product has stopped saying at all, and what it
// buys is that the omission is impossible to make silently. The third thing
// #745 asked about, an article whose *subject* is a product surface that has
// since changed, turned out to need no stamp: no article's subject is a
// surface (every one is a learning from the playbook, bound to it by
// `data/learnings.json`), and the two surfaces that describe the product are
// the hub's and the layout's closing paragraphs, which declare their names.
//
// Nothing here counts articles, names or strings. Writing an article that
// names nothing adds nothing to check; one that names a screen adds its
// `names:`; a rename in the studio reaches this at the next snapshot.
//
//   npm run resources:coverage     prints the report
//   npm test                       fails by name on a gap (test/resources-coverage.test.js)

const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');

const ROOT = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, 'src', 'resources');
const HUB = path.join(ROOT, 'src', 'resources.njk');
const LAYOUT = path.join(ROOT, 'src', '_includes', 'article.njk');
const SNAPSHOT = path.join(ROOT, 'data', 'studio-strings.json');
const CORPUS = path.join(ROOT, 'data', 'help-corpus.json');

/**
 * Names a surface says on purpose that the product does not. Empty today, and
 * the shape is the point: an exclusion carries a written reason, and one whose
 * name no surface declares any more turns this red rather than excusing for
 * ever whatever takes that name next.
 *
 * @type {Array<{name: string, why: string}>}
 */
const EXCLUSIONS = [];

const rel = file => path.relative(ROOT, file).replace(/\\/g, '/');

/** The website's rule for a help file's URL, and the only one: drop the order prefix and the extension. */
const slugOf = name => String(name).replace(/\.md$/, '').replace(/^\d+-/, '');

const escapeRe = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does this text name that thing: the whole phrase, its own case, on its own word boundaries? */
function says(text, name) {
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRe(name)}([^A-Za-z0-9]|$)`).test(String(text));
}

/** The `/help/…` and `/resources/…` targets a source links to, markdown and href alike, with their lines. */
function linksIn(text) {
  const found = [];
  String(text).split('\n').forEach((line, i) => {
    const seen = new Set();
    for (const m of line.matchAll(/(?:\]\(|href=")(\/(?:help|resources)(?:\/[^)\s"#?]*)?)(?:[#?][^)\s"]*)?(?:\)|")/g)) {
      const href = m[1];
      if (seen.has(href)) continue;
      seen.add(href);
      const [, section, rest] = href.match(/^\/(help|resources)(?:\/(.*))?$/);
      const target = (rest || '').replace(/\/+$/, '');
      found.push({ line: i + 1, href, section, target: target || null });
    }
  });
  return found;
}

/** One surface, read from its file: its declared names and the text a reader sees. */
function readSurface(file, kind) {
  const raw = fs.readFileSync(file, 'utf8');
  let parsed;
  try { parsed = matter(raw); }
  catch (e) { return { file: rel(file), kind, names: null, text: '', error: `frontmatter the parser cannot read: ${e.message}` }; }
  const fm = parsed.data || {};
  const names = fm.names === undefined ? [] : fm.names;
  const head = [fm.title, fm.dek, fm.description].filter(v => typeof v === 'string').join('\n');
  return {
    file: rel(file),
    kind,
    slug: kind === 'article' ? path.basename(file, '.md') : null,
    names,
    text: `${head}\n${parsed.content}`,
  };
}

/** The real surfaces: every article, the hub and the layout. */
function readSurfaces() {
  const out = fs.readdirSync(ARTICLES).filter(f => f.endsWith('.md')).sort().map(f => readSurface(path.join(ARTICLES, f), 'article'));
  out.push(readSurface(HUB, 'hub'));
  out.push(readSurface(LAYOUT, 'layout'));
  return out;
}

/** The vendored inventory, or null with the reason when it is not there. */
function readSnapshot() {
  if (!fs.existsSync(SNAPSHOT)) return null;
  const s = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  return { strings: Array.isArray(s.strings) ? s.strings : [], fetchedAt: s.fetchedAt || null, commit: (s.source && s.source.commit) || null };
}

/** The help corpus snapshot's files, name and text. */
function readCorpus() {
  if (!fs.existsSync(CORPUS)) return [];
  const c = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
  return (c.files || []).filter(f => f && typeof f.name === 'string').map(f => ({ name: f.name, text: String(f.text || '') }));
}

/**
 * The whole report.
 *
 * `given` exists for the test and earns its keep the way the siblings' does:
 * a check nobody has watched fail is a check nobody should trust, so
 * `test/resources-coverage.test.js` drives this with synthetic surfaces, a
 * synthetic catalogue and a synthetic corpus and asserts on the failure text
 * a real gap would produce. Called with nothing, which is how the suite and
 * the CLI call it, it reads the real repo.
 */
function resourcesCoverage(given = {}) {
  const surfaces = given.surfaces || readSurfaces();
  const snapshot = 'snapshot' in given ? given.snapshot : readSnapshot();
  const strings = snapshot ? snapshot.strings : [];
  const corpus = given.corpus || readCorpus();
  const exclusions = given.exclusions || EXCLUSIONS;
  const minStrings = given.minStrings ?? 200;
  const helpSlugs = corpus.map(f => slugOf(f.name));
  const articleSlugs = surfaces.filter(s => s.kind === 'article' && s.slug).map(s => s.slug);

  const structural = [];
  if (!snapshot) {
    structural.push(
      'data/studio-strings.json is missing: the list of what the product says, which every declared name is checked '
      + 'against. Run `npm run strings:snapshot` with the studio checked out beside this repo and commit the result.',
    );
  } else if (strings.length < minStrings) {
    structural.push(
      `Only ${strings.length} strings in data/studio-strings.json — expected at least ${minStrings}. The studio says `
      + 'thousands, so the snapshot was written from a checkout the extractor could not read. Re-run '
      + '`npm run strings:snapshot`; do not delete the assertion.',
    );
  }
  if (!corpus.length) structural.push('data/help-corpus.json holds no guide — half the catalogue this check reads is missing, and every /help/ link is about to read as broken. Run `npm run help:snapshot`.');
  if (!surfaces.some(s => s.kind === 'article')) structural.push('No article was read out of src/resources/ — the reader is broken, not the section empty.');
  for (const s of surfaces) {
    if (s.error) structural.push(`${s.file}: ${s.error}`);
    else if (!Array.isArray(s.names) || s.names.some(n => typeof n !== 'string' || !n.trim())) {
      structural.push(`${s.file}: \`names:\` must be a YAML list of the screens, buttons and verbs the page names, as the product spells them.`);
    }
  }

  // Names: each declared name must be in the surface's own words, and still
  // be something the studio says or the help corpus explains.
  const covered = [];
  const uncovered = [];
  const unsaid = [];
  const excused = new Map(exclusions.map(e => [e.name, e]));
  const declared = new Set();
  for (const s of surfaces) {
    if (!Array.isArray(s.names)) continue;
    for (const name of s.names) {
      if (typeof name !== 'string') continue;
      declared.add(name);
      const entry = { file: s.file, name };
      if (!says(s.text, name)) unsaid.push(entry);
      const inCatalogue = strings.some(string => says(string, name));
      const where = corpus.filter(f => says(f.text, name)).map(f => f.name);
      if (inCatalogue || where.length) covered.push({ ...entry, catalogue: inCatalogue, where });
      else if (excused.has(name)) covered.push({ ...entry, catalogue: false, where: [], excused: excused.get(name).why });
      else uncovered.push(entry);
    }
  }

  // Links: every /help/ and /resources/ target names a page.
  const broken = [];
  const links = [];
  for (const s of surfaces) {
    for (const link of linksIn(s.text)) {
      links.push({ file: s.file, ...link });
      if (link.target === null) continue;
      const slugs = link.section === 'help' ? helpSlugs : articleSlugs;
      if (slugs.includes(link.target)) continue;
      const numbered = /^\d+-(.+)$/.exec(link.target);
      const suggestion = numbered && slugs.includes(numbered[1]) ? `/${link.section}/${numbered[1]}/` : null;
      broken.push({ file: s.file, ...link, suggestion });
    }
  }

  // An exclusion is stale when no surface declares its name any more, or
  // when the product says it again.
  const stale = exclusions
    .filter(e => !declared.has(e.name) || strings.some(string => says(string, e.name)) || corpus.some(f => says(f.text, e.name)))
    .map(e => ({ ...e, reason: declared.has(e.name) ? 'the product says it again' : 'no surface declares that name any more' }));

  return { surfaces, snapshot, strings, corpus, helpSlugs, articleSlugs, links, covered, uncovered, unsaid, broken, stale, structural };
}

/** The failure text, the part that has to be worth reading at 2am. */
function resourcesFailures(report) {
  const failures = [...report.structural];
  for (const gap of report.uncovered) {
    failures.push(
      `${gap.file} names "${gap.name}" and no screen, button or help guide says it any more (data/studio-strings.json, `
      + `${report.snapshot && report.snapshot.fetchedAt ? `studio as of ${report.snapshot.fetchedAt}` : 'no snapshot'}; data/help-corpus.json). `
      + 'Rewrite the sentence for what the product says now, refresh the snapshot if the product still says it '
      + '(`npm run strings:snapshot`), or add it to EXCLUSIONS in tools/resources-coverage.js with a reason.',
    );
  }
  for (const gap of report.unsaid) {
    failures.push(
      `${gap.file} declares the name "${gap.name}" in \`names:\` but its own text does not say it. \`names\` is the `
      + 'page\'s index of what it teaches, so a name the page does not say checks nothing: drop it, or restore the words.',
    );
  }
  for (const link of report.broken) {
    failures.push(
      `${link.file}:${link.line} links to ${link.href}, and no ${link.section === 'help' ? 'guide in the help corpus' : 'article under src/resources/'} `
      + `has that address${link.suggestion ? ` — it should be ${link.suggestion}` : ''}.`,
    );
  }
  for (const e of report.stale) {
    failures.push(
      `EXCLUSIONS in tools/resources-coverage.js still excuses "${e.name}", but ${e.reason}. Delete the entry: a stale `
      + 'exclusion silently excuses whatever takes that name next.',
    );
  }
  return failures;
}

function print(report) {
  const failures = resourcesFailures(report);
  const articles = report.surfaces.filter(s => s.kind === 'article').length;
  const age = report.snapshot ? `studio strings as of ${report.snapshot.fetchedAt || '?'}${report.snapshot.commit ? ` (${report.snapshot.commit.slice(0, 7)})` : ''}, ${report.strings.length} of them` : 'no studio strings snapshot';
  console.log(`  ${articles} articles, the hub and the layout · ${age} · ${report.corpus.length} help guides\n`);
  for (const s of report.surfaces) {
    const names = Array.isArray(s.names) ? s.names : [];
    if (!names.length) continue;
    console.log(`  ${s.file}`);
    for (const name of names) {
      const hit = report.covered.find(c => c.file === s.file && c.name === name);
      const said = !report.unsaid.some(u => u.file === s.file && u.name === name);
      const found = hit ? (hit.excused ? `excluded: ${hit.excused}` : [hit.catalogue ? 'the studio says it' : null, ...hit.where].filter(Boolean).join(', ')) : 'NOT SAID BY THE PRODUCT';
      console.log(`    ${hit && said ? 'ok  ' : 'FAIL'} "${name}" — ${said ? found : 'not in the page\'s own text'}`);
    }
  }
  const declared = report.surfaces.filter(s => Array.isArray(s.names) && s.names.length).length;
  console.log(`\n  ${report.links.length} links into /help/ and /resources/, ${report.broken.length} broken · ${declared} surfaces declare names, ${report.covered.length} covered, ${report.uncovered.length} not\n`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  if (!failures.length) console.log('  every declared name is one the product says, and every link names a page.');
  return failures;
}

module.exports = { EXCLUSIONS, slugOf, says, linksIn, readSurface, readSurfaces, readSnapshot, readCorpus, resourcesCoverage, resourcesFailures };

if (require.main === module) {
  const report = resourcesCoverage();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(resourcesFailures(report).length ? 1 : 0); }
  process.exit(print(report).length ? 1 : 0);
}
