#!/usr/bin/env node
'use strict';
/* Refresh `data/lessons.json` — the getting-started course, as the studio
   mails it, for `/learn/` (#742).
 *
 * The course is eight lessons in `public/lessons.js` in `prospektor-ai/studio`:
 * `lib/course.js` mails one a day (#31) and Getting started draws the same
 * eight as cards (#741). `/learn/` is those lessons as pages somebody can read
 * without an account and without waiting eight days for the mail, so the
 * pages are the mails' own words and nothing else. That is why this is a
 * snapshot rather than a copy: a lesson rewritten in the studio reaches these
 * pages at the next `npm run lessons:snapshot`, the way a renamed button
 * reaches `data/studio-strings.json` at the next `npm run strings:snapshot`,
 * and nobody keeps two versions of one sentence by hand.
 *
 * Vendored rather than fetched, for the reason `tools/strings-snapshot.js`
 * gives: the table is a shell module served at no API, and an authoring
 * step that reads a sibling checkout keeps the Netlify build free of the
 * studio. The snapshot carries the studio commit and the date so the page
 * and the coverage report can say how old the words they show are.
 *
 *   npm run lessons:snapshot                    reads ../studio
 *   npm run lessons:snapshot -- /path/to/studio reads that checkout
 *
 * Run it deliberately and commit the result, the way the other snapshots are.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'lessons.json');
const TABLE = 'public/lessons.js';

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
  const file = path.join(dir, TABLE);
  if (!fs.existsSync(file)) {
    console.error(`✗ ${file} is not there.\n  Pass the studio checkout: npm run lessons:snapshot -- /path/to/studio\n  The snapshot was NOT changed.`);
    process.exit(1);
  }
  process.stdout.write(`Reading ${TABLE} in ${dir} … `);
  const { LESSONS, COURSE_GROUPS } = await import(pathToFileURL(file).href);
  const lessons = LESSONS.map(l => ({
    day: l.day, topic: l.topic, subject: l.subject, opener: l.opener, bullets: l.bullets, close: l.close,
    path: l.path, label: l.label, names: l.names || [],
  }));
  if (lessons.length < 4 || lessons.some(l => !l.subject || !l.opener || !Array.isArray(l.bullets))) {
    console.error(`\n✗ ${lessons.length} lessons came back and the shape is wrong — the table could not be read.\n  The snapshot was NOT changed.`);
    process.exit(1);
  }
  fs.writeFileSync(OUT, JSON.stringify({
    '//': 'The getting-started course, as `public/lessons.js` in prospektor-ai/studio holds it, read out of that checkout by `npm run lessons:snapshot`. Do not hand-edit: `/learn/` draws these pages from it (#742) and `tools/resources-coverage.js` checks their names against the product.',
    fetchedAt: new Date().toISOString().slice(0, 10),
    source: { repo: 'prospektor-ai/studio', file: TABLE, commit: commitOf(dir) },
    groups: COURSE_GROUPS,
    lessons,
  }, null, 2) + '\n');
  console.log(`ok\n  ${lessons.length} lessons in ${COURSE_GROUPS.length} groups\n  → ${path.relative(process.cwd(), OUT)}`);
}

main().catch(error => { console.error(error); process.exit(1); });
