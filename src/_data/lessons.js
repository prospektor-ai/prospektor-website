/* The course, for /learn/ (#742): `data/lessons.json`, which `npm run
   lessons:snapshot` writes out of the studio's `public/lessons.js`. This file
   only adds what a page needs and the table does not carry: a slug, a URL, a
   title that says where in the course a page sits, and a description that
   fits a search result. Nothing here is prose; the words are the mails'. */
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '..', 'data', 'lessons.json');
const DESCRIPTION_MAX = 155;

/** The opener, or its first sentence when the whole would not fit a snippet. */
function describe(opener) {
  const text = String(opener || '').trim();
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
    description: describe(l.opener),
  }));
  // The way through the course, on each lesson, so the page's foot needs no
  // lookup in the template: the day before, the day after, or nothing.
  const brief = l => l && { day: l.day, slug: l.slug, url: l.url, subject: l.subject };
  for (const l of lessons) {
    l.previous = brief(lessons.find(o => o.day === l.day - 1)) || null;
    l.next = brief(lessons.find(o => o.day === l.day + 1)) || null;
  }
  const groups = raw.groups.map(g => ({ ...g, lessons: lessons.filter(l => l.day >= g.days[0] && l.day <= g.days[1]) }));
  return { count, groups, lessons, fetchedAt: raw.fetchedAt, source: raw.source };
};
