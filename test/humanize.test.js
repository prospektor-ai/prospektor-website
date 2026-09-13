// The humanizer standard (#640, out of the studio's #634) — the check that
// keeps the website's copy sounding like a person wrote it.
//
// Three things, in the order they matter:
//
// 1. **The scanner finds what the skill says it finds, and nothing else.**
//    Every fixture below is one of `.claude/skills/humanizer/SKILL.md`'s own
//    before/after pairs, or one of the cases that bit on the studio's first
//    run (its read as it's, a print sheet read as an abstract landscape, a
//    quoted phrase read as a used one). A pattern that flags the *after* text
//    is a pattern that gets deleted within a month, so both directions are
//    pinned — and so are the two readers this repo added, because a block
//    reader that reads the JSON-LD counts a dash nobody sees.
// 2. **The copy carries no strong tell.** A strong tell is one the skill acts
//    on at one sighting; there is no ceiling for those, only zero, and the
//    failure names the string and where it lives so the fix is a search. The
//    one exception is `/resources/`, which arrived at 43 across twenty-six
//    articles on 13 Sep 2026 — a row of its own — and carries a ceiling that
//    only goes down until it is zero.
// 3. **The dash count only goes down.** 124 connector dashes in the funnel's
//    450 strings, 192 in the legal pages, 331 in the articles on 13 Sep 2026
//    cannot all go to zero in one thread, and a check that demanded it would
//    be deleted. So each surface has a ceiling in `tools/humanize.js`, the
//    test fails past it, and it also fails when the count has fallen well
//    *under* it — naming the number to write — so a thread that rewrote a
//    page records the gain and nobody spends it.
//
// Nothing here counts pages, sentences or languages. Adding a page adds its
// sentences to a surface that is already measured; a new language lands with
// no ceiling row and is reported, not red (#131's rule) — a translation keeps
// its own language's punctuation, the way the studio decided in #634.
const { test, describe } = require('node:test');
const assert = require('node:assert');

const H = require('../lib/humanize.js');
const { CEILING, surfaces, surfaceOf, spellings, textParagraphs } = require('../tools/humanize.js');
const { siteBuild } = require('./helpers.js');

const ids = text => H.strongTells(text).map(tell => tell.id);

/* ------------------------------ the scanner ----------------------------- */

describe('the scanner', () => {
  test('the strong tells: the skill\'s own before-texts are caught, its after-texts are clean', () => {
    const pairs = [
      ['not-but', "It's not just about the beat; it's part of the aggression. It's not merely a song, it's a statement.", 'The heavy beat adds to the aggressive tone.'],
      ['not-but', 'This does not mean every choice is equal. It means there is no external system that confirms which is right.', 'No external system confirms which choice is right.'],
      ['not-but', 'That is not a limitation, it is the point.', 'That is the point.'],
      ['closer', 'Caching cuts repeat work. That is the real win.', 'Caching cuts repeat work.'],
      ['deep', 'At its core, what really matters is organizational readiness.', 'That mostly depends on whether the organization is ready.'],
      ['run-up', "Let's dive into how caching works. Here's what you need to know.", 'Next.js caches data at multiple layers.'],
      ['arguing', "This isn't mainly about prompt length, and I'm not saying documentation doesn't matter.", 'The issue is whether the agent can use the instruction when it acts.'],
      ['words', 'An enduring testament to Italian influence is the widespread adoption of pasta in the culinary landscape.', 'Pasta dishes, introduced during Italian colonization, remain common.'],
      ['inflated', 'Established in 1989, marking a pivotal moment in the evolution of regional statistics.', 'Established in 1989, part of a wider decentralization.'],
      ['sales', 'Nestled within the breathtaking region of Gonder, a vibrant town with stunning natural beauty.', 'Alamata Raya Kobo is a town in the Gonder region of Ethiopia.'],
      ['authority', 'Experts believe it plays a crucial role in the regional ecosystem.', 'Researchers study the Haolai River for its unusual characteristics.'],
      ['chat', 'Great question! Here is an overview of the French Revolution. I hope this helps!', 'The French Revolution began in 1789.'],
      ['mail-opener', 'I hope this finds you well. I wanted to reach out to explore synergies.', 'Your student photos carry six shoot dates, so batch-plus-stragglers is already how the firm works.'],
    ];
    for (const [id, before, after] of pairs) {
      assert.ok(ids(before).includes(id), `${id}: not caught in ${JSON.stringify(before)} (got ${ids(before).join(',') || 'nothing'})`);
      assert.deepStrictEqual(ids(after), [], `${id}: the after-text is flagged ${ids(after).join(',')} — ${JSON.stringify(after)}`);
    }
  });

  test('the dash is counted as a connector, not as a range, a hyphen, a URL or code', () => {
    assert.strictEqual(H.dashCount('The policy — announced without warning — affects workers.'), 2);
    assert.strictEqual(H.dashCount('The changes -- long overdue -- take effect.'), 2);
    assert.strictEqual(H.dashCount('Week 1–2, then a 0–100 score, sorted A–Z, on a first-run screen.'), 0);
    assert.strictEqual(H.dashCount('A spaced en dash – like this one – is a connector.'), 2);
    assert.strictEqual(H.dashCount('See `a — b` at https://x.y/a—b for {name}.'), 0);
    assert.strictEqual(H.dashCount('Add “— why they are a good one” and the search knows which way to be alike.'), 0, 'a phrase in quotation marks is discussed, not used');
    assert.strictEqual(H.findTells('The new policy — announced without warning.').find(tell => tell.id === 'dash').strength, 'weak');
  });

  test('the cases that bit on the studio\'s first run stay clean', () => {
    assert.deepStrictEqual(ids('it is looking, rather than guessing.'), []);
    assert.deepStrictEqual(ids('This is what a request is. It is a question.'), []);
    assert.deepStrictEqual(ids('Press its pencil first and the download carries the edit. Its shape holds.'), []);
    assert.deepStrictEqual(ids('one slide to a landscape sheet'), [], 'the print orientation is not the abstraction');
    assert.deepStrictEqual(ids('the competitive landscape'), ['words']);
    assert.deepStrictEqual(ids('He said "at its core" and meant it.'), [], 'a quoted phrase is discussed, not used');
    assert.deepStrictEqual(ids('It’s not just a song, it’s a statement.'), ['not-but'], 'a curly apostrophe is an apostrophe');
  });

  test('judge: the shape the report reads', () => {
    const j = H.judge('Nothing yet — every edit steers the next run, and this is the highest-leverage thing you can do here.');
    assert.strictEqual(j.dashes, 1);
    assert.deepStrictEqual(j.strong.map(tell => tell.id), ['words']);
    assert.strictEqual(j.verbose, false);
    assert.strictEqual(H.wordCount('one two  three\nfour'), 4);
    const r = H.report([{ text: 'A — B', where: 'x' }, { text: 'Plain.', where: 'y' }]);
    assert.deepStrictEqual([r.count, r.dashes, r.dashed, r.strong.length], [2, 1, 1, 0]);
  });

  // The reader this repo added: a built page, block by block, the way a
  // visitor reads it. What it must NOT read is the point of the fixture —
  // the JSON-LD, a stylesheet, an SVG and a comment all carry a dash below,
  // and none of them is a sentence anybody sees.
  test('htmlBlocks reads a built page the way a visitor does, and nothing a visitor cannot see', () => {
    const html = [
      '<html><head><title>Pricing — Prospektor</title>',
      '<meta name="description" content="A page &amp; its price">',
      '<script type="application/ld+json">{"name":"not — read"}</script>',
      '<style>p { --gap: 1rem; } /* not — read */</style></head>',
      '<body><nav><ul><li><a href="/">Who to pitch</a></li></ul></nav>',
      '<h1>Find Leads.<br><span class="accent">That fit you.</span></h1>',
      '<p>Runs are <strong>unlimited</strong> &mdash; and <code>a — b</code> is code.</p>',
      '<input placeholder="Type your domain — acme.com">',
      '<svg><text>not — read</text></svg><!-- not — read --></body></html>',
    ].join('\n');
    const blocks = H.htmlBlocks(html);
    assert.deepStrictEqual(blocks, [
      'A page & its price',
      'Type your domain — acme.com',
      'Pricing — Prospektor',
      'Who to pitch',
      'Find Leads. That fit you.',
      'Runs are unlimited — and `a — b` is code.',
    ]);
    assert.strictEqual(H.report(blocks.map(text => ({ text }))).dashes, 3, 'the title, the placeholder and the paragraph; the code span is exempt');
  });

  test('literals reads sentences, not markup, CSS, comments or regexes', () => {
    const source = [
      "const esc = s => String(s).replace(/[&<>\"']/g, c => map[c]);",
      'const x = para(`<strong style="color:${BRAND.ink};">${esc(company)}</strong> — ${esc(scoreLine)} and the rest of the sentence`);',
      "const css = 'font-family:Inter,sans-serif;color:#111;margin:0 0 8px';",
      "const short = 'Open it';",
      "// 'A sentence in a comment that must not be read at all, ever'",
      "/* 'Nor one in a block comment, which is also long enough' */",
      'const html = \'<a href="x">Stop emails about finished runs</a> — one click and it is done\';',
    ].join('\n');
    assert.deepStrictEqual(H.literals(source), [
      'X — X and the rest of the sentence',
      'Stop emails about finished runs — one click and it is done',
    ]);
  });

  test('spellings: every way a sentence is written in source', () => {
    const forms = spellings("Undone — nothing was kept from that correction’s edit.\nNext");
    assert.ok(forms.includes("Undone \\u2014 nothing was kept from that correction\\u2019s edit.\\nNext"));
    assert.ok(forms.includes('Undone &#8212; nothing was kept from that correction&#8217;s edit.\nNext'));
  });

  test('textParagraphs reads llms.txt as prose', () => {
    assert.deepStrictEqual(textParagraphs('# Title\n\n> A **bold** [link](https://x.y) here.\n- one item\n\n1. numbered · 2'),
      ['Title', 'A bold link here. one item', 'numbered · 2']);
  });
});

/* ------------------------- what is read, and what is not ------------------ */

describe('what is read', () => {
  test('a language twin is measured through its catalogue, and the help section is the studio\'s', () => {
    assert.strictEqual(surfaceOf('/es/pricing/'), null, 'a twin: its catalogue is the surface');
    assert.strictEqual(surfaceOf('/help/'), null, 'the studio\'s corpus (#639)');
    assert.strictEqual(surfaceOf('/help/01-getting-started/'), null);
    assert.strictEqual(surfaceOf('/privacy/'), 'legal');
    assert.strictEqual(surfaceOf('/terms/'), 'legal');
    assert.strictEqual(surfaceOf('/resources/'), 'resources');
    assert.strictEqual(surfaceOf('/resources/niche-down/'), 'resources');
    for (const url of ['/', '/pricing/', '/checkout/done/', '/integrations/close/', '/404.html']) assert.strictEqual(surfaceOf(url), 'funnel', url);
  });
});

/* ------------------------------- the copy ------------------------------- */

// One build, read once, then one test per surface — the surfaces are read
// synchronously so the tests can be declared from them.
const built = siteBuild('humanize');
let all;
try { all = surfaces({ site: built.dir }); } finally { built.cleanup(); }

const describeRow = row => `${JSON.stringify(row.text.length > 120 ? `${row.text.slice(0, 119)}…` : row.text)} [${row.where}]`;

describe('the copy', () => {
  test('the readers see the site — a surface with a handful of strings is a broken reader, not a quiet site', () => {
    assert.ok(all.funnel.count > 200, `funnel: ${all.funnel.count} strings`);
    assert.ok(all.legal.count > 100, `legal: ${all.legal.count} strings`);
    assert.ok(all.resources.count > 500, `resources: ${all.resources.count} strings`);
    assert.ok(all.scripts.count > 30, `scripts: ${all.scripts.count} strings`);
    assert.ok(all.functions.count > 10, `functions: ${all.functions.count} strings`);
    for (const row of [...all.funnel.rows, ...all.legal.rows, ...all.resources.rows])
      assert.ok(!/^\/(?:es|de|nl|help)\//.test(row.where), `a twin or a help page was read as this repo's copy: ${row.where}`);
  });

  for (const [name, summary] of Object.entries(all)) {
    const ceiling = CEILING[name] || {};

    test(`${name}: no string carries a strong tell${ceiling.strong !== undefined ? ' past the ceiling, and the ceiling only goes down' : ''}`, () => {
      const offenders = summary.strong.map(row => `${row.strong.map(tell => `${tell.section} ${tell.name} "${tell.match}"`).join('; ')} — ${describeRow(row)}`);
      if (ceiling.strong === undefined) {
        assert.deepStrictEqual(offenders, [], `${offenders.length} string(s) carry a tell the humanizer standard acts on at one sighting (npm run humanize -- ${name} lists them; /humanizer rewrites one):\n  ${offenders.join('\n  ')}`);
        return;
      }
      assert.ok(offenders.length <= ceiling.strong,
        `${name} carries ${offenders.length} strings with a strong tell against a ceiling of ${ceiling.strong} — never raise the ceiling; rewrite the sentence:\n  ${offenders.join('\n  ')}`);
      assert.ok(offenders.length >= ceiling.strong - 2 || ceiling.strong === 0,
        `${name} carries ${offenders.length} strings with a strong tell, under the ceiling of ${ceiling.strong} — record the gain: set CEILING.${name}.strong to ${offenders.length} in tools/humanize.js.`);
    });

    if (ceiling.dashes === undefined) continue; // a new surface: reported by the tool, not yet ratcheted

    test(`${name}: the dash count only goes down`, () => {
      assert.ok(summary.dashes <= ceiling.dashes,
        `${name} carries ${summary.dashes} connector dashes against a ceiling of ${ceiling.dashes} — a dash is this site's own most common tell (npm run humanize -- ${name} lists every one). Rewrite the sentence with a period, a comma, a colon or parentheses; never raise the ceiling.`);
      const slack = Math.max(5, Math.floor(ceiling.dashes * 0.05));
      assert.ok(summary.dashes > ceiling.dashes - slack || ceiling.dashes === 0,
        `${name} carries ${summary.dashes} connector dashes, well under the ceiling of ${ceiling.dashes} — record the gain: set CEILING.${name}.dashes to ${summary.dashes} in tools/humanize.js so the next thread cannot spend it.`);
    });

    if (ceiling.verbose !== undefined) {
      test(`${name}: the count of strings past ${H.VERBOSE_WORDS} words only goes down`, () => {
        assert.ok(summary.verbose <= ceiling.verbose,
          `${name} has ${summary.verbose} strings past ${H.VERBOSE_WORDS} words against a ceiling of ${ceiling.verbose} (npm run humanize -- ${name} lists them longest first). Cut, never raise the ceiling.`);
        assert.ok(summary.verbose >= ceiling.verbose - 3 || ceiling.verbose === 0,
          `${name} has ${summary.verbose} strings past ${H.VERBOSE_WORDS} words, under the ceiling of ${ceiling.verbose} — set CEILING.${name}.verbose to ${summary.verbose} in tools/humanize.js.`);
      });
    }
  }
});
