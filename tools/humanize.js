#!/usr/bin/env node
'use strict';
// `npm run humanize` — the copy, held to the humanizer standard (#640, out of
// the studio's #634).
//
//   npm run humanize                    the report: every surface, summed
//   npm run humanize -- funnel          one surface, every finding listed with
//                                       where it lives (funnel, legal, resources,
//                                       scripts, mail, or a language code)
//   npm run humanize -- --json          the raw report
//   npm run humanize -- --site <dir>    read an existing build instead of making one
//
// What is read, and why these surfaces:
//
// - **funnel** is every English page the build writes that is not the help
//   section, a legal page or an article: `/`, the two product pages,
//   `/pricing/`, `/checkout/` and its done page, `/contact/` and its thanks
//   page, `/integrations/close/`, the 404, and `/llms.txt`. Read from the BUILT
//   page, block by block, the way a visitor reads it — so a sentence that
//   arrives from frontmatter, from `site.json` or from a `{% t %}` block is
//   one sentence wherever it was written, and the nav and the footer count
//   once. It is the surface the row says to rewrite first, and the one the
//   test gates hardest.
// - **legal** is `/terms/`, `/privacy/` and `/dpa/`, derived from `site.legal`.
//   Measured and held, not rewritten here: two of them carry wording still
//   unmerged on the operator's desk (#529, #531) and nine of `/privacy/`'s
//   sentences are pinned by name in the studio's `test/privacy-claims.test.js`.
//   A dash in one of those is that row's to remove.
// - **resources** is `/resources/` and every article under it: written, not
//   translated, and the largest surface by far. Its own ceiling, so a gain in
//   the funnel cannot be spent on an article and the other way round.
// - **scripts** is every sentence a script says, off `lib/i18n.js`'s
//   inventory: the scan field's errors and states, the checkout's, the buy
//   form's, the cookie notice, the language nudge.
// - **functions** is every sentence a function says: the welcome email's
//   (the `t('…')` calls the inventory reads out of `netlify/functions/`), the
//   operator notices, and what a function answers the browser with (the
//   ownership refusal, the address that does not look like one) — the string
//   literals of every file under `netlify/functions/` and `netlify/lib/`, tags
//   stripped. A literal is a coarse unit, and a log line counts beside a mail
//   because a person reads both; a mail is the one surface nobody re-reads
//   after it ships.
// - **es, de, nl** — one surface per catalogue under `src/_data/strings/`,
//   its values. The English sentence is the key, so the English is measured
//   on the pages and the translations here; a fourth language arrives with
//   nobody editing this file.
//
// NOT read: `/help/` and its guide pages. That text is the studio's corpus,
// rendered here (#136, #166), and it is the studio's #639. The hub's own
// sentences — its lede, its search box, its FAQ — are this repo's, so they
// join the funnel off the inventory rather than off the page.
//
// The ceilings below are the ratchet. `test/humanize.test.js` fails when a
// surface's dash count rises past its ceiling, and it also fails when the
// count has fallen well under it, naming the number to write here, so a
// thread that rewrote a page records the gain and the next thread cannot
// quietly spend it. Strong tells have no ceiling: zero, always, on every
// surface. A surface with no row here is reported and not ratcheted, which
// is how a new language lands green.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const i18n = require('../lib/i18n.js');
const H = require('../lib/humanize.js');

const ROOT = path.join(__dirname, '..');
const site = require('../src/_data/site.json');

/**
 * The ratchet. `dashes` is the most connector dashes the surface may carry;
 * `verbose` the most strings past `VERBOSE_WORDS`. Lower a number when the
 * copy has earned it; the test says which one and to what.
 */
const CEILING = {
  funnel: { dashes: 0, verbose: 17 },
  legal: { dashes: 189 },
  resources: { dashes: 304, strong: 43 },
  scripts: { dashes: 0, verbose: 6 },
  functions: { dashes: 0, verbose: 3 },
  es: { dashes: 135 },
  de: { dashes: 136 },
  nl: { dashes: 136 },
};

/** Every file whose string literals a person may read: a mail, a notice, a
 *  reply to the browser, a log line. Derived from the two directories, so a
 *  new function is measured with nobody editing this. */
const functionFiles = () => ['netlify/functions', 'netlify/lib'].flatMap(dir =>
  fs.readdirSync(path.join(ROOT, dir)).filter(name => name.endsWith('.js')).sort().map(name => `${dir}/${name}`));

/* -------------------------------- the build ------------------------------- */

const ELEVENTY = path.join(ROOT, 'node_modules', '.bin', 'eleventy');

/** A built site to read: the one handed down (`PPS_TEST_SITE`, `--site`), or a
 *  fresh build into a temp directory with the help corpus offline, so this
 *  never waits on the studio. */
function builtSite(given) {
  const dir0 = given || process.env.PPS_TEST_SITE;
  if (dir0) return { dir: dir0, cleanup() {} };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'humanize-'));
  execFileSync(ELEVENTY, ['--quiet', '--output=' + dir], {
    cwd: ROOT, stdio: 'pipe', env: { ...process.env, HELP_CORPUS_OFFLINE: '1' },
  });
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const htmlPages = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? htmlPages(path.join(dir, e.name))
    : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []);
const urlOf = (dir, file) => '/' + path.relative(dir, file).replace(/index\.html$/, '').replace(/\\/g, '/');

/* ------------------------------- the surfaces ----------------------------- */

/** Which surface a built page belongs to, or null for one that is not this
 *  repo's English copy: a language twin (its catalogue is the surface) or the
 *  help section (the studio's corpus). */
function surfaceOf(url) {
  if (i18n.localeOf(url) !== i18n.DEFAULT) return null;
  if (/^\/help(?:\/|$)/.test(url)) return null;
  if ((site.legal || []).some(l => l.url === url)) return 'legal';
  if (url.startsWith('/resources/')) return 'resources';
  return 'funnel';
}

/** Paragraphs of a markdown-ish text file, markup stripped. */
function textParagraphs(text) {
  return String(text).split(/\n\s*\n/).map(p => p
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ').trim())
    .filter(p => p && /[A-Za-z\u00C0-\u024F]{2}/.test(p));
}

const plain = s => H.decodeEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** The built English pages, block by block, each sentence counted once and
 *  attributed to the first surface it appears on — funnel first, so the
 *  chrome every page shares is the funnel's. */
function pageItems(dir) {
  const out = { funnel: [], legal: [], resources: [] };
  const seen = new Set();
  const rank = { funnel: 0, legal: 1, resources: 2 };
  const pages = htmlPages(dir)
    .map(file => ({ file, url: urlOf(dir, file) }))
    .map(p => ({ ...p, surface: surfaceOf(p.url) }))
    .filter(p => p.surface)
    .sort((a, b) => rank[a.surface] - rank[b.surface] || a.url.localeCompare(b.url));
  const add = (surface, text, where) => {
    if (seen.has(text)) return;
    seen.add(text);
    out[surface].push({ text, where });
  };
  for (const p of pages) for (const text of H.htmlBlocks(fs.readFileSync(p.file, 'utf8'))) add(p.surface, text, p.url);
  // The help hub's own sentences, off the inventory: the page itself is
  // mostly the studio's text, and that is #639's.
  for (const e of i18n.inventory()) {
    if (!/^src\/help(?:-guide)?\.njk$/.test(e.file) || !['block', 'filter', 'data'].includes(e.kind)) continue;
    const text = plain(e.key);
    if (text) add('funnel', text, e.file);
  }
  const llms = path.join(dir, 'llms.txt');
  if (fs.existsSync(llms)) for (const text of textParagraphs(fs.readFileSync(llms, 'utf8'))) add('funnel', text, '/llms.txt');
  return out;
}

/** The spellings a sentence can have in a source: raw, JS-escaped, entity-encoded. */
function spellings(text) {
  const js = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  return [...new Set([
    text,
    js,
    js.replace(/—/g, '\\u2014').replace(/’/g, '\\u2019').replace(/…/g, '\\u2026'),
    text.replace(/—/g, '&#8212;').replace(/“/g, '&#8220;').replace(/”/g, '&#8221;').replace(/’/g, '&#8217;'),
    text.replace(/—/g, '&mdash;').replace(/’/g, '&rsquo;'),
    text.replace(/'/g, '&#39;'),
  ])];
}

/** `file:line` of the first spelling of `text` found whole in `file`, else `file`. */
function lineOf(file, text) {
  const body = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const form of spellings(text)) {
    const at = body.indexOf(form);
    if (at >= 0) return `${file}:${body.slice(0, at).split('\n').length}`;
  }
  return file;
}

/** Every sentence a script says, off the inventory: what the browser can say
 *  in the scan field, the checkout, the buy form, the cookie notice and the
 *  language nudge. */
function scriptItems() {
  const items = [];
  const seen = new Set();
  for (const e of i18n.inventory()) {
    if (e.kind !== 'script' && e.kind !== 'site') continue;
    const text = plain(e.key);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push({ text, where: e.kind === 'site' ? e.file : lineOf(e.file, e.key) });
  }
  return items;
}

/** The welcome email's sentences (the inventory's `mail` kind) and the
 *  literals of every function and library file. */
function functionItems() {
  const items = [];
  const seen = new Set();
  for (const e of i18n.inventory()) {
    if (e.kind !== 'mail') continue;
    const text = plain(e.key);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push({ text, where: lineOf(e.file, e.key) });
  }
  for (const file of functionFiles()) {
    for (const text of H.literals(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      if (seen.has(text)) continue;
      seen.add(text);
      items.push({ text, where: file });
    }
  }
  return items;
}

/** One catalogue's values, each with the line its key sits on. */
function catalogueItems(code) {
  const cat = i18n.catalogueOf(code);
  if (!cat) return [];
  const file = path.relative(ROOT, cat.file);
  const body = fs.readFileSync(cat.file, 'utf8');
  return Object.entries(cat.raw).map(([key, value]) => {
    const at = body.indexOf(JSON.stringify(key));
    return { text: plain(value), where: at >= 0 ? `${file}:${body.slice(0, at).split('\n').length}` : file };
  }).filter(item => item.text);
}

/** Every surface, summed: `{ funnel, legal, resources, scripts, mail, es, … }`. */
function surfaces({ site: dir } = {}) {
  const built = builtSite(dir);
  try {
    const pages = pageItems(built.dir);
    const out = {
      funnel: H.report(pages.funnel),
      legal: H.report(pages.legal),
      resources: H.report(pages.resources),
      scripts: H.report(scriptItems()),
      functions: H.report(functionItems()),
    };
    for (const l of i18n.built()) if (l.code !== i18n.DEFAULT) out[l.code] = H.report(catalogueItems(l.code));
    return out;
  } finally {
    built.cleanup();
  }
}

/* --------------------------------- locate --------------------------------- */
//
// A built block back to the line it was written on. Each source is read the
// way the build reads it — comments dropped, `{{ site.x }}` resolved, tags and
// template syntax blanked, entities decoded, whitespace folded — while a map
// from every character of the result to its offset in the file is kept, so a
// whole-text match points at a line. A block the build assembled from more
// than one expression does not match, and its page URL is printed instead.

function rewrite(state, re, fn) {
  const { text, map } = state;
  const out = [];
  const m2 = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    for (let i = last; i < m.index; i++) { out.push(text[i]); m2.push(map[i]); }
    for (const ch of fn(m)) { out.push(ch); m2.push(map[m.index]); }
    last = m.index + m[0].length;
  }
  for (let i = last; i < text.length; i++) { out.push(text[i]); m2.push(map[i]); }
  return { text: out.join(''), map: m2 };
}

const fromFile = text => ({ text, map: [...text].map((c, i) => i) });

function normalizeSource(file, text) {
  let s = fromFile(text);
  if (/\.(?:njk|html)$/.test(file)) {
    s = rewrite(s, /\{#[\s\S]*?#\}/g, () => ' ');
    s = rewrite(s, /\{\{-?\s*site\.(\w+)\s*-?\}\}/g, m => (typeof site[m[1]] === 'string' ? site[m[1]] : ' '));
    s = rewrite(s, /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, () => ' ');
  }
  if (/\.md$/.test(file)) {
    s = rewrite(s, /\[([^\]]+)\]\([^)]*\)/g, m => m[1]);
    s = rewrite(s, /\*+|^\s*#+\s*|^\s*>\s?/gm, () => '');
  }
  if (/\.json$/.test(file)) {
    s = rewrite(s, /\\u([0-9a-fA-F]{4})/g, m => String.fromCharCode(parseInt(m[1], 16)));
    s = rewrite(s, /\\(["\\/])/g, m => m[1]);
    s = rewrite(s, /\\n/g, () => ' ');
  }
  s = rewrite(s, /<code\b[^>]*>([\s\S]*?)<\/code>/gi, m => '`' + m[1].replace(/<[^>]+>/g, '') + '`');
  s = rewrite(s, /<[^>]+>/g, () => ' ');
  s = rewrite(s, /&#x[0-9a-f]+;|&#\d+;|&[a-z]+;/gi, m => H.decodeEntities(m[0]));
  s = rewrite(s, /\s+/g, () => ' ');
  return s;
}

const SOURCE_DIRS = ['src', 'src/_includes', 'src/resources'];
let sources = null;
function loadSources() {
  if (sources) return sources;
  sources = [];
  for (const dir of SOURCE_DIRS) {
    for (const name of fs.readdirSync(path.join(ROOT, dir)).sort()) {
      if (!/\.(?:njk|html|md)$/.test(name)) continue;
      const file = path.join(dir, name);
      sources.push({ file, norm: normalizeSource(file, fs.readFileSync(path.join(ROOT, file), 'utf8')) });
    }
  }
  const siteFile = 'src/_data/site.json';
  sources.push({ file: siteFile, norm: normalizeSource(siteFile, fs.readFileSync(path.join(ROOT, siteFile), 'utf8')) });
  return sources;
}

/** `file:line` where a built block was written, or null. */
function locate(text) {
  for (const { file, norm } of loadSources()) {
    const at = norm.text.indexOf(text);
    if (at < 0) continue;
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return `${file}:${raw.slice(0, norm.map[at]).split('\n').length}`;
  }
  return null;
}

/* ---------------------------------- print --------------------------------- */

const PAGE_SURFACES = new Set(['funnel', 'legal', 'resources']);
const clip = (text, n = 110) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const whereOf = (name, row) => (PAGE_SURFACES.has(name) && row.where.startsWith('/') ? `${row.where} → ${locate(row.text) || '?'}` : row.where);

function printSurface(name, summary, { full = false } = {}) {
  const ceiling = CEILING[name] || {};
  console.log(`\n## ${name} — ${summary.count} strings`);
  console.log(`   dashes ${summary.dashes} in ${summary.dashed} strings (ceiling ${ceiling.dashes ?? 'none'}) · strong tells ${summary.strong.length} · weak ${summary.weak.length}${ceiling.verbose !== undefined ? ` · over ${H.VERBOSE_WORDS} words ${summary.verbose} (ceiling ${ceiling.verbose})` : ''}`);
  for (const row of summary.strong) {
    console.log(`   ✗ ${row.strong.map(tell => `${tell.section} ${tell.name}: "${tell.match}"`).join('; ')}`);
    console.log(`     ${clip(row.text)}  [${whereOf(name, row)}]`);
  }
  if (!full) return;
  const listed = summary.rows
    .filter(row => row.dashes || (row.verbose && ceiling.verbose !== undefined) || row.weak.length)
    .sort((a, b) => b.dashes - a.dashes || b.words - a.words);
  for (const row of listed) {
    const marks = [
      row.dashes ? `${row.dashes} dash${row.dashes > 1 ? 'es' : ''}` : '',
      row.verbose && ceiling.verbose !== undefined ? `${row.words} words` : '',
      ...row.weak.map(tell => `${tell.section} ${tell.match}`),
    ].filter(Boolean);
    console.log(`   · ${marks.join(' · ')}  [${whereOf(name, row)}]\n     ${clip(row.text, 160)}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const siteAt = args.includes('--site') ? args[args.indexOf('--site') + 1] : undefined;
  const all = surfaces({ site: siteAt });
  const pick = args.find(arg => all[arg]);
  if (json) { console.log(JSON.stringify(pick ? { [pick]: all[pick] } : all, null, 2)); return; }
  console.log('The copy, against the humanizer standard (.claude/skills/humanizer/SKILL.md; the patterns in lib/humanize.js).');
  for (const [name, summary] of Object.entries(all)) {
    if (pick && name !== pick) continue;
    printSurface(name, summary, { full: Boolean(pick) });
  }
  if (!pick) console.log(`\nOne surface with every string listed: npm run humanize -- ${Object.keys(all).join(' | ')}.`);
}

module.exports = { CEILING, functionFiles, surfaces, surfaceOf, pageItems, scriptItems, functionItems, catalogueItems, textParagraphs, spellings, locate, builtSite };

if (require.main === module) {
  try { main(); } catch (error) { console.error(error); process.exit(1); }
}
