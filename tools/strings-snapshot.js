#!/usr/bin/env node
'use strict';
/* Refresh `data/studio-strings.json` — every string the studio can say, in
   English, as `tools/resources-coverage.js` reads it (#745).
 *
 * The check asks whether a name an article declares (a screen, a button, a
 * verb) is still something the product says. The product's list of what it
 * says is `dev/i18n-strings.js#inventory()` in `prospektor-ai/studio`, a scan
 * of the studio's own source: it exists at no URL and is never served, so
 * there is nothing for a build to fetch. This file is the one place that
 * reads a sibling checkout, and it is an authoring step, never a build step:
 * `npm test` reads the committed snapshot and the Netlify build never runs
 * this, which is what keeps the check green for the same reason on a laptop
 * and in the build (the studio's `test/privacy-claims.test.js` precedent).
 *
 * Vendored rather than exported, said once: exporting would mean the studio
 * adding an endpoint, a deploy and a build-time fetch whose fallback is this
 * snapshot anyway. The cost of vendoring is lag: a rename in the studio
 * reaches this check when a thread next runs `npm run strings:snapshot`,
 * the same lag `npm run help:snapshot` accepts for the help corpus, and the
 * studio's own `dev/tour-coverage.js` catches the rename on its side the day
 * it happens. The snapshot carries the studio commit and the date so the
 * report can say how old the list it read is.
 *
 *   npm run strings:snapshot                    reads ../studio
 *   npm run strings:snapshot -- /path/to/studio reads that checkout
 *
 * Run it deliberately and commit the result, the way the help snapshot is.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'studio-strings.json');
const INVENTORY = 'dev/i18n-strings.js';

/** The studio checkout to read: the argument, `STUDIO_DIR`, or the sibling directory. */
function studioDir(args) {
  const given = args.find(a => !a.startsWith('--')) || process.env.STUDIO_DIR || path.join(ROOT, '..', 'studio');
  return path.resolve(given);
}

function commitOf(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { stdio: 'pipe' }).toString().trim(); }
  catch { return null; }
}

async function main() {
  const dir = studioDir(process.argv.slice(2));
  const file = path.join(dir, INVENTORY);
  if (!fs.existsSync(file)) {
    console.error(`✗ ${file} is not there.\n  Pass the studio checkout: npm run strings:snapshot -- /path/to/studio\n  The snapshot was NOT changed.`);
    process.exit(1);
  }
  process.stdout.write(`Reading ${INVENTORY}#inventory() in ${dir} … `);
  const { inventory } = await import(pathToFileURL(file).href);
  const found = await inventory();
  const strings = [...found.keys].sort();
  if (strings.length < 200) {
    console.error(`\n✗ only ${strings.length} strings came back, and the studio says thousands — the extractor could not read it.\n  The snapshot was NOT changed.`);
    process.exit(1);
  }
  const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { strings: [] };
  const before = new Set(previous.strings || []);
  const added = strings.filter(s => !before.has(s)).length;
  const gone = [...before].filter(s => !strings.includes(s)).length;
  fs.writeFileSync(OUT, JSON.stringify({
    '//': 'Every string the studio can say, in English: `dev/i18n-strings.js#inventory()` in prospektor-ai/studio, read out of that checkout by `npm run strings:snapshot`. Do not hand-edit. `tools/resources-coverage.js` reads it to check that a name an article declares is still one the product says (#745).',
    fetchedAt: new Date().toISOString().slice(0, 10),
    source: { repo: 'prospektor-ai/studio', file: `${INVENTORY}#inventory()`, commit: commitOf(dir) },
    count: strings.length,
    strings,
  }, null, 2) + '\n');
  console.log(`ok\n  ${strings.length} strings${before.size ? ` (${added} new, ${gone} gone since the last snapshot)` : ''}\n  → ${path.relative(process.cwd(), OUT)}`);
}

main().catch(error => { console.error(error); process.exit(1); });
