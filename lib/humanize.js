'use strict';
// The humanizer standard (#640, out of the studio's #634): how the website's
// words avoid sounding like a model wrote them, stated once and read by one
// kind of reader — the check. The studio generates its deliverables and so
// carries the standard into its prompts as `VOICE_RULES`; this site is
// written by hand, so the standard lives in `.claude/skills/humanizer/` (the
// 25 patterns, read before writing) and in `CLAUDE.md` (the seven this
// lane's copy actually commits), and this file is what turns `npm test` red.
//
// `findTells()` finds what a regex can find honestly. The patterns are the
// ones in `.claude/skills/humanizer/SKILL.md` (blader/humanizer, MIT, built
// on Wikipedia's *Signs of AI writing*), numbered by that file's sections and
// carried over from `lib/humanize.js` in `prospektor-ai/studio` unchanged, so
// the two repos disagree about nothing. A forced triad, a repeated opening or
// a bold label is a judgment, and `/humanizer` is where that judgment lives;
// nothing here grades prose.
//
// Two strengths, as the skill has them. A **strong** tell justifies an edit
// on one sighting: the not-X-but-Y contrast, the one-line closer, the saying
// that sounds deep, the staged run-up, arguing with nobody, the stock
// vocabulary, inflated significance, sales dressing, chat residue and the
// greeting-card mail opener. A **weak** tell needs company: a dash, a
// stacked qualifier, a plain verb dressed up, a word a person also uses.
// `test/humanize.test.js` gates on strong tells and on the dash *count*;
// weak ones are reported by `npm run humanize`.
//
// What is exempt, so the scanner does not cry wolf: a URL, an inline code
// span (a `<code>` element reads as one), a `{placeholder}`, a phrase inside
// quotation marks (discussed, not used), a whole block that is a quotation (a
// `<blockquote>` is a speaker's words, #649), an en dash between two digits (a
// range is typography, not a connector), and a hyphen inside a word.
//
// Two readers live here too, because the test and the tool both need them:
// `htmlBlocks()` reads a built page the way a visitor does (one string per
// block of text, scripts and styles skipped, entities decoded), and
// `literals()` reads the string literals of a Netlify function the way the
// operator reads the mail they compose.

const W = words => new RegExp(`\\b(?:${words})\\b`, 'gi');

/** A string past this many words is reported as verbose (the studio's `/style` rule 2, as a number). */
const VERBOSE_WORDS = 40;

/**
 * The patterns, numbered by the section of the skill they come from.
 * `strength` is the skill's own: strong justifies an edit on one sighting.
 */
const TELLS = [
  {
    id: 'not-but', section: '§1', strength: 'strong', name: 'not X but Y',
    re: /\bnot (?:just|only|merely|simply) [^.!?\n]{1,60}?,? (?:but|it's|it is)\b|\b(?:it's not|it is not|this is not|that is not|this isn't|it isn't|that isn't|isn't|is not|are not|aren't) (?:just |only |merely |simply |mainly )?(?:about |a |an |the )?[^.!?\n]{1,50}?[,;:.] (?:it's|it is|this is|they are|but rather)\b|\b(?:this|that|it) (?:does not|doesn't) mean [^.!?\n]{1,80}\. (?:it|this|that) means\b/gi,
  },
  {
    id: 'closer', section: '§2', strength: 'strong', name: 'one-line closer',
    re: /\b(?:that is|that'?s) the real (?:win|point|story|value|lesson)\b|\bread that again\b|\blet that sink in\b|\bthink about that\b/gi,
  },
  {
    id: 'deep', section: '§3', strength: 'strong', name: 'saying that sounds deep',
    re: /\bat its core\b|\bthe real question is\b|\bwhat really matters\b|\bfundamentally\b|\bthe heart of the matter\b|\bthe deeper issue\b|\bis the (?:language|currency|architecture) of\b|\bbecomes a trap\b/gi,
  },
  {
    id: 'run-up', section: '§4', strength: 'strong', name: 'staged run-up',
    re: /\blet'?s (?:dive|explore|break (?:this|it) down|be honest|unpack)\b|\bhere'?s what you need to know\b|\bwithout further ado\b|\bhere'?s the thing\b|\bthe thing is\b|\breal talk\b|\bheads up\b|(?:^|[.!?]\s+)(?:honestly|look)[?,:]/gi,
  },
  {
    id: 'arguing', section: '§5', strength: 'strong', name: 'arguing with no one',
    re: /\bthis isn'?t (?:mainly |just |only )?about\b|\bi'?m not saying\b|\bto be clear\b|\bdon'?t get me wrong\b|\bthis is not to say\b|\bsome might say\b|\ba tempting approach\b|\bone might be tempted\b|\byou might think\b|\bit would be easy to just\b/gi,
  },
  {
    id: 'dash', section: '§8', strength: 'weak', name: 'dash as connector',
    re: /—|(?<![\w])–|–(?![\w])|\s--\s/g,
  },
  {
    id: 'qualifiers', section: '§9', strength: 'weak', name: 'stacked qualifiers',
    re: /\bcould potentially\b|\bmight arguably\b|\bit'?s also possible\b|\bto be fair\b|\bpotentially possibly\b/gi,
  },
  {
    id: 'words', section: '§12', strength: 'strong', name: 'stock AI vocabulary',
    re: W('delv(?:e|es|ed|ing)|testament|landscape(?!\\s+(?:orientation|mode|page|format|paper|sheet))|tapestry|pivotal|crucial(?:ly)?|meticulous(?:ly)?|robust(?:ly|ness)?|showcas(?:e|es|ed|ing)|underscor(?:e|es|ed|ing)|bolster(?:s|ed|ing)?|foster(?:s|ed|ing)?|garner(?:s|ed|ing)?|intricate|intricacies|vibrant|seamless(?:ly)?|leverag(?:e|es|ed|ing)|elevat(?:e|es|ed|ing)|empower(?:s|ed|ing|ment)?|streamlin(?:e|es|ed|ing)|game-changing|game changer|cutting-edge|deep dive|synerg(?:y|ies|istic)|interplay|enduring|enhanc(?:e|es|ed|ing|ement)|journey'),
  },
  {
    id: 'words-weak', section: '§12', strength: 'weak', name: 'word a model overuses',
    re: W('actually|additionally|align(?:s|ed)? with|highlight(?:s|ed|ing)?|valuable|quietly|unlock(?:s|ed|ing)?|emphasi[sz](?:e|es|ed|ing)'),
  },
  {
    id: 'inflated', section: '§13', strength: 'strong', name: 'inflated significance',
    re: /\bstands as a testament\b|\ba (?:pivotal|crucial|defining|watershed) moment\b|\bplays? an? (?:key|crucial|vital|pivotal|central) role\b|\bmarking an? (?:new|significant|major|pivotal)\b|\bunderscores its importance\b|\breflects a broader\b|\b(?:enduring|lasting) legacy\b|\bsetting the stage\b|\bevolving landscape\b|\bindelible mark\b|\bcontinues to thrive\b|\bthe future looks bright\b|\bexciting times\b|\ba step in the right direction\b/gi,
  },
  {
    id: 'riders', section: '§15', strength: 'weak', name: 'shallow -ing rider',
    re: /,\s+(?:highlighting|underscoring|emphasizing|emphasising|ensuring|reflecting|symbolizing|symbolising|showcasing|fostering|cultivating|encompassing)\b/gi,
  },
  {
    id: 'sales', section: '§16', strength: 'strong', name: 'sales language',
    re: /\bboasts?\b|\bbreathtaking\b|\bstunning\b|\bnestled\b|\bin the heart of\b|\brenowned\b|\bgroundbreaking\b|\bmust-visit\b|\bdiverse array\b|\bprofound(?:ly)?\b|\bcommitment to excellence\b|\bworld-class\b|\bbest-in-class\b|\bstate-of-the-art\b|\bunparalleled\b|\bexemplif(?:y|ies|ied|ying)\b/gi,
  },
  {
    id: 'authority', section: '§17', strength: 'strong', name: 'borrowed authority',
    re: /\bexperts (?:argue|believe|say|agree|suggest)\b|\bobservers have\b|\bindustry reports (?:suggest|show|indicate)\b|\bsome critics\b|\bseveral publications\b/gi,
  },
  {
    id: 'serves-as', section: '§18', strength: 'weak', name: 'is, are, has dressed up',
    re: /\bserves as\b|\bstands as\b|\bfunctions as\b|\boperates as\b|\brepresents an?\b/gi,
  },
  {
    id: 'chat', section: '§22', strength: 'strong', name: 'chat residue',
    re: /\bi hope this helps\b|\bgreat question\b|\byou'?re absolutely right\b|\bcertainly!|\bof course!|\bwould you like me to\b|\bwant me to\b|\bshould i continue\b|\blet me know if\b|\bhere is an? (?:overview|summary|breakdown) of\b|\bfeel free to\b/gi,
  },
  {
    id: 'mail-opener', section: 'mail', strength: 'strong', name: 'greeting-card mail opener',
    re: /\bi hope this (?:e-?mail |message |note )?finds you well\b|\bhope you'?re (?:doing )?well\b|\bi (?:wanted|am writing|'m writing) to reach out\b|\breaching out\b|\bexplore synergies\b|\bpick your brain\b|\btouch base\b|\bcircle back\b|\bjust following up\b|\bi trust this\b/gi,
  },
  {
    id: 'disclaimer', section: '§23', strength: 'weak', name: 'knowledge-limit disclaimer or guess',
    re: /\bas of my (?:last|knowledge)\b|\bmy (?:last )?training\b|\bnot widely documented\b|\bbased on available information\b|\bmaintains a low profile\b|\bit is believed that\b/gi,
  },
];

/**
 * Blank what the scanner must not read: URLs, inline code, placeholders and
 * markdown link targets. Same length, so an index still points into `text`.
 */
function maskExempt(text) {
  return String(text == null ? '' : text)
    .replace(/’/g, "'")
    .replace(/https?:\/\/[^\s)>"']+/g, m => ' '.repeat(m.length))
    .replace(/`[^`\n]*`/g, m => ' '.repeat(m.length))
    .replace(/\]\([^)\n]*\)/g, m => ' '.repeat(m.length))
    .replace(/\{[a-zA-Z_][\w.]*\}/g, m => ' '.repeat(m.length))
    // A block that is one quotation from its first character to its last is
    // somebody else's words whole — `htmlBlocks()` wraps a <blockquote>'s
    // lines that way — and a tell the speaker committed is theirs to keep
    // (#649: the skill's own rule, *leave a watched phrase alone inside a
    // quotation*, applied to a transcript).
    .replace(/^“[\s\S]*”$/, m => ' '.repeat(m.length))
    // A phrase inside quotation marks is discussed, not used (the skill's own
    // exemption): a rule that names "at its core" is not a rule that uses it.
    .replace(/["“][^"“”\n]{1,80}["”]/g, m => ' '.repeat(m.length));
}

/**
 * Every tell in one text, strongest first.
 * @returns {Array<{id: string, section: string, strength: 'strong'|'weak', name: string, match: string, index: number}>}
 */
function findTells(text) {
  const masked = maskExempt(text);
  const found = [];
  for (const tell of TELLS) {
    tell.re.lastIndex = 0;
    let m;
    while ((m = tell.re.exec(masked))) {
      found.push({ id: tell.id, section: tell.section, strength: tell.strength, name: tell.name, match: m[0].trim(), index: m.index });
      if (!tell.re.global) break;
    }
  }
  return found.sort((a, b) => (a.strength === b.strength ? a.index - b.index : a.strength === 'strong' ? -1 : 1));
}

const strongTells = text => findTells(text).filter(tell => tell.strength === 'strong');

/** How many dashes a text uses as connectors (the ones the rule bans, not ranges or hyphens). */
const dashCount = text => findTells(text).filter(tell => tell.id === 'dash').length;

const wordCount = text => String(text == null ? '' : text).split(/\s+/).filter(Boolean).length;

/**
 * One text, judged: what `tools/humanize.js` prints a line for and what the
 * test reads. `verbose` is true when the word count is past the line.
 */
function judge(text) {
  const tells = findTells(text);
  const words = wordCount(text);
  return {
    text,
    words,
    dashes: tells.filter(tell => tell.id === 'dash').length,
    strong: tells.filter(tell => tell.strength === 'strong'),
    weak: tells.filter(tell => tell.strength === 'weak' && tell.id !== 'dash'),
    verbose: words > VERBOSE_WORDS,
  };
}

/**
 * A whole surface, summed. `items` is `[{ text, where }]`; `where` is what
 * the report prints beside a finding (a page, a file and line) and is passed
 * through.
 */
function report(items) {
  const rows = items.map(item => ({ ...item, ...judge(item.text) }));
  return {
    count: rows.length,
    dashes: rows.reduce((sum, row) => sum + row.dashes, 0),
    dashed: rows.filter(row => row.dashes > 0).length,
    verbose: rows.filter(row => row.verbose).length,
    strong: rows.filter(row => row.strong.length > 0),
    weak: rows.filter(row => row.weak.length > 0),
    rows,
  };
}

// ── Readers ────────────────────────────────────────────────────────────────

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', rarr: '→', larr: '←',
  middot: '·', bull: '•', copy: '©', times: '×', euro: '€', pound: '£',
};
/** HTML entities, named and numeric, as the characters a reader sees. */
function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}

// The elements whose edges end a block of text. `br` is not one: a headline
// broken for its layout is still one sentence. `code` becomes a backtick
// span, so `maskExempt` keeps the scanner out of it.
const BLOCK_TAG = /<\/?(?:p|h[1-6]|li|dt|dd|td|th|tr|blockquote|figcaption|summary|label|button|option|legend|caption|pre|div|section|article|header|footer|nav|main|aside|ul|ol|dl|table|form|fieldset|details|address|hr|title|html|body|head)\b[^>]*>/gi;

/**
 * Every block of text a reader of a built page sees, in document order:
 * one string per block element, plus the title, the description, and the
 * placeholder, aria-label and alt attributes (the scan field's placeholder
 * is copy too). Scripts, styles, templates and SVG are skipped — the JSON-LD
 * and the i18n payload are not prose — and entities are decoded.
 */
function htmlBlocks(html) {
  const h = String(html == null ? '' : html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  const out = [];
  const push = s => {
    const text = decodeEntities(s).replace(/\s+/g, ' ').trim();
    if (text && /[A-Za-zÀ-ɏ]{2}/.test(text)) out.push(text);
  };
  for (const m of h.matchAll(/<meta\s+name="description"\s+content="([^"]*)"/gi)) push(m[1]);
  for (const m of h.matchAll(/\s(?:placeholder|aria-label|alt)="([^"]*)"/gi)) push(m[1]);
  const text = h
    // A <blockquote> is somebody else's words. Each of its lines is wrapped in
    // quotation marks so `maskExempt` reads the block as quoted — discussed,
    // not used — and a dash or a tell inside it is the speaker's, not the
    // writer's (#649). The attribution line is wrapped too; it is not prose.
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, inner) =>
      '\n' + inner.replace(BLOCK_TAG, '\n').split('\n').map(line => (line.trim() ? `“${line.trim()}”` : '')).join('\n') + '\n')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (m, c) => '`' + c.replace(/<[^>]+>/g, '') + '`')
    .replace(BLOCK_TAG, '\n')
    .replace(/<[^>]+>/g, ' ');
  for (const line of text.split('\n')) push(line);
  return out;
}

/**
 * The string literals of a JavaScript source, as a person would read them:
 * comments skipped, JS escapes resolved, template expressions stood in for
 * by a token, tags stripped, whitespace folded. Only a literal that reads as
 * a sentence counts: at least 25 characters, two words of letters, and not
 * a run of CSS or an attribute. A regex literal is skipped whole, because
 * `/[&<>"']/g` is not the opening of a string.
 */
function literals(source) {
  const code = String(source == null ? '' : source);
  const out = [];
  let i = 0;
  let prev = '';
  const expressionStart = /[(,=:\[!&|?{};+\-*%<>~^]$|\b(?:return|typeof|case|in|of|do|else|throw|new|delete|void|yield|await)$/;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '/' && code[i + 1] === '/') { i = code.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '/' && code[i + 1] === '*') { const end = code.indexOf('*/', i + 2); i = end < 0 ? code.length : end + 2; continue; }
    if (ch === '/' && (prev === '' || expressionStart.test(prev))) {
      // A regex literal: skip to its unescaped closing slash, classes included.
      let j = i + 1;
      let cls = false;
      for (; j < code.length; j++) {
        if (code[j] === '\\') { j += 1; continue; }
        if (code[j] === '\n') break;
        if (cls) { if (code[j] === ']') cls = false; continue; }
        if (code[j] === '[') cls = true;
        else if (code[j] === '/') break;
      }
      i = j + 1;
      prev = ')';
      continue;
    }
    if (ch !== "'" && ch !== '"' && ch !== '`') {
      if (!/\s/.test(ch)) prev = (prev + ch).slice(-8);
      i += 1;
      continue;
    }
    const quote = ch;
    let j = i + 1;
    let text = '';
    let closed = false;
    while (j < code.length) {
      const c = code[j];
      if (c === '\\') {
        const next = code[j + 1];
        if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(code.slice(j + 2, j + 6))) { text += String.fromCharCode(parseInt(code.slice(j + 2, j + 6), 16)); j += 6; continue; }
        text += next === 'n' ? '\n' : next === 't' ? ' ' : next;
        j += 2;
        continue;
      }
      if (quote === '`' && c === '$' && code[j + 1] === '{') {
        // Skip the expression, brace-counted, and stand a token in for it.
        let depth = 0;
        let k = j + 1;
        for (; k < code.length; k++) {
          if (code[k] === '{') depth += 1;
          else if (code[k] === '}') { depth -= 1; if (depth === 0) break; }
        }
        text += ' X ';
        j = k + 1;
        continue;
      }
      if (c === '\n' && quote !== '`') break; // an unterminated literal: not one
      if (c === quote) { closed = true; break; }
      text += c;
      j += 1;
    }
    i = j + 1;
    prev = ')';
    if (!closed) continue;
    const plain = decodeEntities(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (plain.length < 25 || !/[a-z]{3}.*[a-z]{3}/i.test(plain)) continue;
    if (/[\w-]+:\s*[^;]+;\s*[\w-]+:/.test(plain) || /^[\w-]+=/.test(plain)) continue; // CSS or an attribute
    out.push(plain);
  }
  return out;
}

module.exports = {
  VERBOSE_WORDS, TELLS, maskExempt, findTells, strongTells, dashCount, wordCount, judge, report,
  decodeEntities, htmlBlocks, literals,
};
