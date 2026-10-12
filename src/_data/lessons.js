/* The course, for /learn/ (#742): `data/lessons.json`, which `npm run
   lessons:snapshot` writes out of the studio's `public/lessons.js`. This file
   only adds what a page needs and the table does not carry: a slug, a URL, a
   title that says where in the course a page sits, and a description that
   fits a search result. Nothing here is prose; the words are the mails'. */
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '..', 'data', 'lessons.json');
const DESCRIPTION_MAX = 155;

// Under this a description wastes the snippet (tools/seo-audit.js flags it).
const DESCRIPTION_MIN = 70;

/** The opener, or its first sentence when the whole would not fit a snippet.
    An opener too short to fill one takes the lesson's own bullets after it,
    whole, while they fit (weekly SEO pass, 12 Oct 2026: day 7's opener is 46
    characters). Still the mail's words, and nothing but them. */
function describe(opener, bullets = []) {
  let text = String(opener || '').trim();
  for (const b of bullets) {
    if (text.length >= DESCRIPTION_MIN) break;
    const next = `${text} ${String(b).trim()}`;
    if (next.length > DESCRIPTION_MAX) break;
    text = next;
  }
  if (text.length <= DESCRIPTION_MAX) return text;
  const first = text.match(/^[^.!?]*[.!?]/);
  return first && first[0].length <= DESCRIPTION_MAX ? first[0] : text.slice(0, DESCRIPTION_MAX - 1).replace(/\s+\S*$/, '') + '.';
}

module.exports = () => {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const count = raw.lessons.length;
  const lessons = raw.lessons.map(l => ({
    ...l,
    slug: `day-${l.day}`,
    url: `/learn/day-${l.day}/`,
    title: `Day ${l.day} of ${count}: ${l.subject}`,
    description: describe(l.opener, l.bullets),
  }));
  // The way through the course, on each lesson, so the page's foot needs no
  // lookup in the template: the day before, the day after, or nothing.
  const brief = l => l && { day: l.day, slug: l.slug, url: l.url, subject: l.subject };
  for (const l of lessons) {
    l.previous = brief(lessons.find(o => o.day === l.day - 1)) || null;
    l.next = brief(lessons.find(o => o.day === l.day + 1)) || null;
  }
  const groups = raw.groups.map(g => ({ ...g, lessons: lessons.filter(l => l.day >= g.days[0] && l.day <= g.days[1]) }));
  // The course's length in all, so the hub's one sentence about it cannot drift from the table (#1198).
  const minutes = groups.reduce((sum, g) => sum + (g.minutes || 0), 0);
  return { count, groups, lessons, minutes, fetchedAt: raw.fetchedAt, source: raw.source };
};
