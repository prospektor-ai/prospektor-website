'use strict';
/* The help articles (studio #1201): what /help/ shows since 7 Oct 2026.

   The studio writes them in `docs/help/articles/*.md` (a translation in
   `docs/help/<code>/articles/`, same name) and serves them at `/api/help` as
   `articles: [{ name, text, language }]`, beside the long reference `files`
   the support chat reads and this site no longer publishes. Each article is
   one question: front matter, then two sections, the steps and the facts.

     ---
     title: Find a competitor’s customers
     dek: One or two sentences.
     topic: who
     order: 4
     image: step-02.png        (optional, a file in src/assets/img/demo/)
     next: glance, make-it-yours
     ---
     ## How to do it
     1. …
     ## Good to know
     - …

   This file is the one reader of that shape, used by the build
   (src/_data/help.js), the snapshot tool and the checks. The sections are
   read by POSITION, never by their heading: a translation says
   "Cómo hacerlo", and the page must not care. */

const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

/** The six topics, in the order the hub shows them. `name` is what a reader
 *  sees (and a catalogue translates: lib/i18n.js inventories these). */
const TOPICS = [
  { key: 'start', name: 'Getting started' },
  { key: 'who', name: 'Who to pitch' },
  { key: 'what', name: 'What to send' },
  { key: 'warm', name: 'Warm intros' },
  { key: 'sharper', name: 'Sharper every pitch' },
  { key: 'account', name: 'Your account' },
];
const TOPIC_KEYS = TOPICS.map(t => t.key);

const IMAGE_DIR = path.join(__dirname, '..', 'src', 'assets', 'img', 'demo');

/** A translation opens with the studio's provenance line; it is not content. */
const SOURCE_LINE = /^\s*<!--[\s\S]*?-->\s*\r?\n?/;

const slugOf = name => String(name).replace(/\.md$/, '');

/** Front matter as flat `key: value` lines (the studio's own reading of it),
 *  and the body after it. Not YAML on purpose: a dek with a colon in it is a
 *  sentence, not a mapping. */
function parse(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(String(text || '').replace(SOURCE_LINE, ''));
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

/** Why this is not an article, or null when it is one. */
function problem(file) {
  if (!file || typeof file.name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(file.name)) return 'an article had no plain name';
  if (typeof file.text !== 'string' || !file.text.trim()) return `${file.name} had no text`;
  const p = parse(file.text);
  if (!p) return `${file.name} has no front matter`;
  if (!p.meta.title) return `${file.name} has no title`;
  if (!TOPIC_KEYS.includes(p.meta.topic)) return `${file.name} has no known topic`;
  if (!/^##\s/m.test(p.body)) return `${file.name} has no sections`;
  return null;
}

/** The answer the studio gave (or a snapshot holds), checked: the error, or null. */
function validate(body) {
  if (!body || typeof body !== 'object') return 'response was not an object';
  if (!Array.isArray(body.articles)) return 'response had no articles array';
  if (!body.articles.length) return 'there were no articles';
  for (const f of body.articles) {
    const bad = problem(f);
    if (bad) return bad;
  }
  return null;
}

/** The body cut at its `## ` headings: [{ heading, html, kind }], kind by
 *  position: the first section is the steps, the second the facts. */
function sectionsOf(body) {
  const parts = String(body).split(/^##[ \t]+/m);
  const lead = parts.shift().trim();
  const out = [];
  if (lead) out.push({ heading: '', html: md.render(lead).trim(), kind: 'prose' });
  parts.forEach((part, i) => {
    const nl = part.indexOf('\n');
    const heading = (nl < 0 ? part : part.slice(0, nl)).trim();
    const rest = nl < 0 ? '' : part.slice(nl + 1).trim();
    out.push({ heading, html: md.render(rest).trim(), kind: i === 0 ? 'steps' : i === 1 ? 'facts' : 'prose' });
  });
  return out;
}

/** One article, ready for a template. `prefix` is the edition's ('' or
 *  '/es'), so a link into /help/ inside an article stays in its language. */
function articleOf(file, prefix = '') {
  const { meta, body } = parse(file.text);
  const slug = slugOf(file.name);
  const image = meta.image && /^[\w.-]+\.(png|jpe?g|webp)$/i.test(meta.image)
    && fs.existsSync(path.join(IMAGE_DIR, meta.image)) ? meta.image : null;
  const localize = html => prefix ? html.replace(/href="\/help\//g, `href="${prefix}/help/`) : html;
  return {
    name: file.name,
    slug,
    language: file.language || 'en',
    title: meta.title,
    dek: meta.dek || '',
    topic: meta.topic,
    order: Number(meta.order) || 999,
    image,
    next: String(meta.next || '').split(',').map(s => s.trim()).filter(s => s && s !== slug).slice(0, 3),
    sections: sectionsOf(body).map(s => ({ ...s, html: localize(s.html) })),
  };
}

/** Articles in reading order: by topic, then `order`, then name. */
function sorted(articles) {
  return articles.slice().sort((a, b) =>
    TOPIC_KEYS.indexOf(a.topic) - TOPIC_KEYS.indexOf(b.topic) || a.order - b.order || a.slug.localeCompare(b.slug));
}

/** The studio's own reading of a checkout (`lib/help.js#helpArticles`), for
 *  `npm run help:snapshot -- --from <studio>/docs/help` before the endpoint
 *  serves them: English from `articles/`, and for `code` the translation in
 *  `<code>/articles/` where there is one, English where there is not. */
function readDir(helpDir, code = 'en') {
  const dir = path.join(helpDir, 'articles');
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter(n => n.endsWith('.md')).sort();
  const sub = path.join(helpDir, code, 'articles');
  return names.map(name => {
    const own = code !== 'en' && fs.existsSync(path.join(sub, name));
    const text = fs.readFileSync(own ? path.join(sub, name) : path.join(dir, name), 'utf8').replace(SOURCE_LINE, '').trim();
    return { name, text, language: own ? code : 'en' };
  });
}

module.exports = { TOPICS, TOPIC_KEYS, parse, problem, validate, sectionsOf, articleOf, sorted, slugOf, readDir };
