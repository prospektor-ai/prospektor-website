/* The help articles, at build time, in every language the studio holds one
   in (studio #1201, on the rules #136 and #535 set).

   Since 7 Oct 2026 /help/ is short articles written for a person, one
   question each, and no longer the studio's long reference files (those stay
   the support chat's, unpublished). The studio serves them at `/api/help` as
   `articles`; lib/help-articles.js reads one.

   ── The rule this file exists to enforce ──
   A studio outage must never break a website deploy. There is no code path
   here that throws: the live endpoint, then the committed snapshot
   (`data/help-articles.json`, `data/help-articles.<code>.json`), then
   nothing, every fallback logged loudly. Nothing ships the hub with no
   articles and writes no article pages, so the sitemap never asks for a URL
   the build did not write.

   ── Editions (#535) ──
   `/api/help?lang=es` answers every article, each stamped `language: "es"`
   where the studio holds a translation and `"en"` where it does not. An
   edition (`/<code>/help/`) is written only when at least one article is in
   that language; inside it an article still in English is written (a reader
   following the hub must never 404) but is `noindex` and out of the sitemap,
   its English twin being the page to rank. */

const fs = require('node:fs');
const path = require('node:path');
const A = require('../../lib/help-articles.js');
const i18n = require('../../lib/i18n.js');

// `HELP_API` is an override for the tests that rehearse a studio outage.
const API = process.env.HELP_API || 'https://studio.prospektor.ai/api/help';
const DATA = path.join(__dirname, '..', '..', 'data');
const snapshotFor = code => path.join(DATA, code === i18n.DEFAULT ? 'help-articles.json' : `help-articles.${code}.json`);
const apiFor = code => API + (code === i18n.DEFAULT ? '' : (API.includes('?') ? '&' : '?') + 'lang=' + encodeURIComponent(code));
const TIMEOUT_MS = Number(process.env.HELP_CORPUS_TIMEOUT_MS || 8000);

function loud(what, why) {
  console.warn(
    '\n  ┌─ help articles ───────────────────────────────────────────\n' +
    '  │  ' + what + '\n' +
    '  │  ' + why + '\n' +
    '  │  The build continues on purpose (#136): a studio outage must\n' +
    '  │  never fail a website deploy. Refresh the fallback with\n' +
    '  │  `npm run help:snapshot`.\n' +
    '  └───────────────────────────────────────────────────────────\n');
}

const fileOf = f => ({ name: f.name, text: f.text, language: i18n.languageOf(f.language) || i18n.DEFAULT });

async function fetchLive(code) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(apiFor(code), { signal: control.signal });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const body = await r.json();
    const bad = A.validate(body);
    return bad ? { error: bad } : { files: body.articles.map(fileOf) };
  } catch (e) {
    return { error: e.name === 'AbortError' ? `no answer in ${TIMEOUT_MS}ms` : e.message };
  } finally {
    clearTimeout(timer);
  }
}

function readSnapshot(code) {
  try {
    const body = JSON.parse(fs.readFileSync(snapshotFor(code), 'utf8'));
    const bad = A.validate(body);
    return bad ? { error: bad } : { files: body.articles.map(fileOf), fetchedAt: body.fetchedAt };
  } catch (e) {
    return { error: e.code === 'ENOENT' ? 'no snapshot committed' : e.message };
  }
}

/* One language's articles: live, then snapshot, then nothing. For a language
   other than English, a live answer holding not one article in it is a real
   answer ("none yet") and is not overruled by a snapshot. */
async function articlesFor(code, offline) {
  const live = offline ? { error: 'HELP_CORPUS_OFFLINE=1' } : await fetchLive(code);
  const own = files => files.filter(f => f.language === code).length;
  if (live.files) {
    if (code !== i18n.DEFAULT && !own(live.files)) return { files: [], source: 'none', note: 'the studio holds no article in this language' };
    return { files: live.files, source: 'live', note: '' };
  }
  const snap = readSnapshot(code);
  if (snap.files) {
    if (!offline) loud(`Falling back to the committed ${code} snapshot.`, `The studio's /api/help did not answer usefully: ${live.error}.`);
    return { files: snap.files, source: 'snapshot', note: snap.fetchedAt ? `snapshot taken ${snap.fetchedAt}` : '' };
  }
  if (code === i18n.DEFAULT) loud('Shipping /help/ with no articles.', `Live: ${live.error}. Snapshot: ${snap.error}.`);
  return { files: [], source: 'none', note: `live: ${live.error}; snapshot: ${snap.error}` };
}

/* One edition: a language and everything the templates render from it. */
function edition(lang, files, source) {
  const articles = A.sorted(files.map(f => A.articleOf(f, lang.prefix)));
  const bySlug = new Map(articles.map(a => [a.slug, a]));
  for (const a of articles) {
    a.nextArticles = a.next.filter(s => bySlug.has(s)).map(s => {
      const n = bySlug.get(s);
      return { slug: n.slug, title: n.title, language: n.language };
    });
  }
  const topics = A.TOPICS.map(t => ({ ...t, articles: articles.filter(a => a.topic === t.key) }));
  return {
    code: lang.code, prefix: lang.prefix, own: lang.own, name: lang.name,
    source, articles, topics,
    topic: Object.fromEntries(topics.map(t => [t.key, t])),
    count: articles.length,
    translated: articles.filter(a => a.language === lang.code).length,
  };
}

module.exports = async function () {
  // `HELP_CORPUS_OFFLINE=1` is what `npm test` and `npm run drive` set: a
  // test suite that reaches the studio goes red when the studio deploys.
  const offline = process.env.HELP_CORPUS_OFFLINE === '1';

  const editions = [];
  for (const lang of i18n.built()) {
    const { files, source, note } = await articlesFor(lang.code, offline);
    if (lang.code !== i18n.DEFAULT && !files.some(f => f.language === lang.code)) {
      console.log(`  [help] no ${lang.code} edition (${note || 'no article in this language'})`);
      continue;
    }
    const e = edition(lang, files, source);
    if (source !== 'none') {
      console.log(`  [help] ${lang.code}: ${files.length} articles from the ${source} copy`
        + (lang.code !== i18n.DEFAULT ? `, ${e.translated} in ${lang.name}` : '') + (note ? ` (${note})` : ''));
    }
    editions.push(e);
  }

  const en = editions[0];
  return {
    source: en.source, articles: en.articles, count: en.count,
    editions,
    pages: editions.flatMap(e => e.articles.map(article => ({ edition: e, article, noindex: article.language !== e.code }))),
  };
};
