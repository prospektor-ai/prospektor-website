/* The clickable demo's screens (#767), as `npm run demo:capture` wrote them.

   `data/demo.json` is the studio's one-minute tour read off the real screens:
   one entry per step with the PNG, where the ring sat, the card's title and
   sentence in every language the studio holds them in, the chapter and the
   names the step declares. Nothing here fetches anything: the demo is a
   capture, committed, the way the article cards are (`tools/og.js`), so a
   Netlify build needs neither a browser nor a second checkout. A missing or
   empty file builds an empty demo rather than failing the build; `npm test`
   is what goes red on that (`test/demo.test.js`). */
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '..', 'data', 'demo.json');

module.exports = function () {
  if (!fs.existsSync(FILE)) {
    console.warn('[demo] data/demo.json is missing — run `npm run demo:capture` with the studio checked out beside this repo');
    return { steps: [], chapters: [], chapterNames: {}, capturedAt: null, source: null, viewport: null };
  }
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  // `chapterNames[id]` is the chapter's name in every language, for the count
  // line on a step; a template cannot search a list, so it is keyed here.
  const chapterNames = {};
  for (const c of chapters) chapterNames[c.id] = c.name;
  return {
    steps: Array.isArray(data.steps) ? data.steps : [],
    chapters,
    chapterNames,
    capturedAt: data.capturedAt || null,
    source: data.source || null,
    viewport: data.viewport || null,
  };
};
