# The website contracts

Moved word for word from `CLAUDE.md` on 6 Oct 2026 (studio #1116), so that every session stops loading them. `CLAUDE.md` keeps one line per contract.

## The help contract — one URL per guide, all of it derived (#136, #166)

`/help/` is not written here. The corpus is the **studio's** `docs/help/`, served
at `studio.prospektor.ai/api/help`, and this repo only ever renders it — which is
what makes the two halves of the contract worth stating.

- **Nothing about the help section is hand-listed.** `src/_data/help.js` fetches
  the corpus at build time, `src/help-guide.njk` paginates over it to write one
  page per guide at `/help/<slug>/`, `src/help.njk` is the hub over them, and
  `src/sitemap.njk` derives its `/help/` entries from the same array. A guide the
  studio adds gets a page, a card, three inbound links and a sitemap entry with
  nobody editing this repo; a guide it retires loses all four the same way.
- **A studio outage must never break a website deploy.** `src/_data/help.js` has
  no code path that throws: live endpoint → committed snapshot → empty corpus,
  every fallback logged loudly. An empty corpus ships the hub runtime-only and
  writes **no** guide pages, which is correct — a sitemap must not ask for URLs
  the build did not write.
- **#76's property survived the split, and that is the interesting part.** A help
  change is live for a reader the moment the *studio* deploys, with no website
  publish in between. Two mechanisms keep it: the hub renders a guide the build
  never saw *inline* and links it by anchor (`data-pages` on `#helpGuides` is the
  build's list of slugs that do have a page), and each guide page reconciles its
  own markdown against the live corpus by hash. Both are driven in `test/drive.js`
  §7c and neither may be dropped without putting #76 back on the table.
- **Every fetch of the corpus has a deadline, and the runtime ones are short**
  (#185). The chain above answers a studio that is *dead*; it did not answer one
  that *hangs*, because an unbounded fetch never fails and so never falls back.
  `H.fetchCorpus()` in `help-render.js` is the one door — `H.CORPUS_TIMEOUT_MS`
  is 3s in the browser, because the guides are already in the HTML and the
  reader is not waiting on the studio for anything; the build allows 8s and
  `npm run help:snapshot` 20s, since those are waited on by a machine and not by
  a person. A bare `fetch(API)` added back to `help.js` or `help-guide.js` fails
  `test/help.test.js` by name, and `test/drive.js` §8b drives a studio that
  accepts the connection and never answers.
- **A guide's text must live on exactly one URL.** Leaving the stacked copy on
  the hub as well would recreate the duplication #166 removed, silently and
  without failing anything else. `test/help.test.js` asserts it directly.
- **Nothing in the checks counts guides.** Writing a twelfth guide, or a short
  one, must never turn the suite red — the #131 lesson, the same way the
  learnings ledger keeps it.

## The resources contract — one article per useful learning

`/resources/` is not a blog with a content calendar. The operator's definition,
24 Aug 2026: *"we should create one article per useful learning under /resources
or /blog on the website"*. #144 shipped the section with a fixed list of nine
articles; **#159 made the list derived**, because a fixed list drifts in silence
— a learning lands in the research, nobody writes it up, and nothing goes red.

- **`data/learnings.json` is the ledger.** One row per learning, each carrying
  the source `ref` that finds it in
  `prospektor-ai/studio` → `docs/research/growth-playbook.md`, and a verdict:
  `article` (naming the article that covers it) or `not-publishable` (carrying a
  **written reason** — an exclusion is somebody's argument, never a silent
  omission).
- **Each article declares the ids it covers** in its `learnings:` frontmatter.
- **`test/learnings.test.js` binds the two**, in both directions: a row that
  names a missing article fails, an article that does not declare a row that
  points at it fails, an article with no learning at all fails, and an id no row
  carries fails. `npm run learnings` prints the same report on demand.
- **Nothing in the check counts articles or rows.** Writing more never turns the
  suite red — that is the #131 lesson, where a pinned file count made adding a
  help article break an unrelated test, which is friction pointing exactly the
  wrong way.

**The section is also held to the product it describes (#745, the website half
of #744).** The operator's ask, 17 Sep 2026: *"yes also add /resources to the
check"*, the check being the studio's tour coverage. `tools/resources-coverage.js`
is the enforcer here, in the shape of the studio's `dev/tour-coverage.js` and
`dev/course-coverage.js`, and it lives in this repo because the studio's
`npm test` cannot see this one and Netlify builds each without the other.

- **A surface declares what it names.** An article, the hub
  (`src/resources.njk`) and the article layout's aside
  (`src/_includes/article.njk`) list the product's screens, buttons and
  verbs they name in `names:` in their frontmatter, spelled as the product
  spells them. `npm test` fails by name when a declared name is nothing the
  studio says or its help explains, and when the surface's own text has
  stopped saying it. `names:` is optional: an article about method names
  nothing and declares nothing, and the floor is the siblings' floor, that a
  name still exists somewhere a customer meets it, not that it still labels
  what the article describes.
- **The product's list of what it says is vendored, not exported.**
  `data/studio-strings.json` is the studio's `dev/i18n-strings.js#inventory()`
  read out of a checkout beside this repo by `npm run strings:snapshot`, the
  way `data/help-corpus.json` is the help corpus. The inventory is a scan of
  the studio's source and is served at no URL, so exporting it would mean an
  endpoint, a deploy and a build-time fetch whose fallback is this file; the
  snapshot carries the studio commit and the date, and the report prints them.
  A rename in the studio reaches this check at the next snapshot, and the
  studio's own check catches it there the day it happens.
- **The course is vendored the same way, and `/learn/` is drawn from it (#742).**
  `data/lessons.json` is the studio's `public/lessons.js`, the eight lessons
  the studio mails one a day, read out of the sibling checkout by
  `npm run lessons:snapshot`; the hub at `/learn/` and one page per lesson at
  `/learn/day-N/` are the mail's own words and nothing else, and the sitemap
  derives their URLs from the snapshot. The coverage tool reads each lesson as
  a surface, its `names` against the vendored strings, so a lesson rewritten
  in the studio and not re-snapshotted here fails `npm test` by name. Run the
  snapshot when the studio changes a lesson, and commit the result.
- **Every link into `/help/` and `/resources/` names a page**, resolved
  against the corpus snapshot's slugs and the article files without a build,
  the way the studio's `dev/help-links.js` does. A link written the numbered
  way carries the slug it should have been. `test/pages.test.js` asks the
  same of every built page.
- **What it does not do, said plainly.** #745 asked whether an article whose
  subject is a product surface that has since changed could be caught. No
  article's subject is a surface: every one is a learning from the playbook,
  bound to it by the ledger, and the two paragraphs that describe the product
  are the hub's and the layout's closing ones, which declare their names. So
  there is no staleness stamp, because there is nothing for one to stamp.
- **Nothing counts articles, names or strings.** An article that names nothing
  adds nothing to check; a new name is one line in `names:`.

**The one thing no test can catch, said plainly:** this repo cannot see the
research. A learning added to the playbook and never entered in the ledger is
invisible here. Adding the row is the job of the thread that adds the learning.

Two mechanics the section's size depends on, both in `.eleventy.js`. The
`related` filter is a **ring** — #137 measured what date-ordering cost (inbound
links ran 9,9,9,4,1,1,1,1,1 and five of nine articles were reachable from the
hub and nowhere else), so each article links to the `n` that follow it and every
article ends up with exactly `n` inbound links by construction. Inside the
window it picks, a **same-topic article is listed first**, so the most relevant
link is also the first one a reader sees. The `topics` filter derives the hub's
filter row from the articles themselves. Keep topics few and populated — a topic
with one article is a chip that selects one card and never appears in anybody's
keep-reading block. Ten topics over twenty-three articles is the shape as of
#159.

## The asset contract — the name carries the bytes (#169)

Every asset used to answer `public, max-age=0, must-revalidate`, because a
filename like `main.css` cannot safely be cached: a long cache on it serves a
stale stylesheet after the next deploy. That never cost bandwidth — an `ETag`
made each one a 304 — it cost a repeat visitor **eight conditional round trips
before anything rendered**, on exactly the visitor most likely to buy.

- **The build names css, js and fonts after their contents.** `lib/assets.js`
  is the whole mechanism and carries the reasoning; `.eleventy.js` writes the
  output and exposes one `asset` filter. Assets are no longer passthrough-
  copied.
- **Every reference in a template goes through `{{ '/assets/…' | asset }}`** —
  including the ones served verbatim, which resolve to themselves. A path the
  build does not produce throws at build time instead of 404ing in a browser,
  which is how a missing Open Graph card gets found before it is a blank card
  in somebody's Slack.
- **`fonts.css` is rewritten before it is hashed**, because it names the four
  woff2 files by URL. Hashing it first would publish a stylesheet whose name no
  longer matched its contents — the one failure this exists to prevent.
- **The hashing and the `netlify.toml` headers are ONE change.** `immutable` on
  a tree whose names are not hashed serves stale files for a year; hashing with
  no header buys nothing. `test/assets.test.js` fails in **both** directions,
  and `tools/seo-audit.js` plus `npm run audit` ask production the same.
- **Images are deliberately excluded, and that is not a TODO.** The OG cards
  are referenced by absolute URL from caches this repo does not control, so
  their URLs must not move; `/assets/img/*` gets a day's cache and no
  `immutable`. `test/assets.test.js` pins that too, so a later thread that
  "finishes the job" by hashing them has to argue with a red test first.
- **Nothing counts assets.** Adding a stylesheet, a script or a font can only
  turn the suite red by being unhashed or unreferenced — the #131 rule, that
  friction points at the defect and never at the work.

## The script contract — nothing blocks the parser (#137 F6, #170)

Every `<script src>` this site serves carries `defer` (or `async`, for a tag
Netlify injects). A blocking script stops the parser where it sits, and on
`/help/` — the heaviest page on the site — the two that stayed blocking cost
two serial round trips plus a synchronous index build before the document could
finish parsing.

- **`test/pages.test.js` fails on any built page serving a blocking script**,
  naming the page and the file. It is derived from the build, never from a list
  of filenames: adding a page or a script can only turn it red by adding a
  *blocking* one. Same rule as everywhere else here — friction points at the
  defect, not at the work.
- **`tools/seo-audit.js` flags the same defect against production**, because a
  tag injected into the response is not in this repo's output at all.
- The reason `/help/` was the exception until #170, and why it stopped being
  one, is `SEO-AUDIT.md` **R3**: #136's no-double-render stamp is a comparison
  of two hashes, not a race, so `defer` cannot break it — and the drive proves
  it rather than the reasoning doing so.

## The typeahead contract — one door, and nothing but the characters typed (#241)

The scan field suggests companies as the visitor types — one line each, name
and domain — and a pick fills the field with the domain, because the scan is
domain-keyed underneath. Nothing else on the page moves, and Scan is still the
visitor's press.

- **The source is Clearbit's public suggest endpoint, and only that.** It is
  what the studio has called since before #42 wrote it down, and `/privacy/`
  §08 names it as the recipient (#90). No new third party, no key, no account.
- **The browser never talks to the provider.** `netlify/functions/company-suggest.js`
  is the one door: it forwards the typed characters and nothing else — no
  header, no identifier — and answers `{ name, domain }` pairs. A provider
  entry is **never a URL** (studio #443): Clearbit's `logo` is dropped at the
  boundary, so a browser can never be made to fetch from `logo.clearbit.com`.
  `test/company-suggest.test.js` pins both; `test/drive.js` §15 watches the
  browser's outbound hosts while it types.
- **Every failure is no list.** A dead, slow or odd provider — or the function
  itself unreachable — answers an empty list or nothing, and the field is the
  plain text box it was before. There is no error state to draw.
- **The cost posture per keystroke** is a 200 ms debounce, two characters
  minimum, one request in flight (the previous one is aborted), a ten-minute
  memo in the warm container and a ten-minute browser cache on the answer.
  The provider is free; the meter is Netlify invocations.
- **The list speaks the page's language** through `t()`, the same way every
  other sentence a script says does — its one sentence is in every catalogue.
- **`/privacy/` §08's Clearbit row and §05's typed-in paragraph say the scan
  field sends this.** They said the opposite until #241; the row and the
  sentence were changed in the same push as the field, because the notice may
  never state something false. Studio-side, `DATA-HANDLING.md` §2 and §5 carry
  the same correction.

## The price contract — two plans, one table, and the default sends nothing (#542)

A workspace is $999 a month or **$9,990 a year** — ten months' money for twelve
months, which is the operator's *"two months free thing for prepayment for the
year"* (7 Sep 2026) — and `/terms/` §02 says the yearly price is fixed for that
year. Four surfaces carry a figure and exactly one of them decides it.

- **`PLANS` in `netlify/functions/create-checkout-session.js` is the only place
  either figure is written.** Both are inline `price_data`, so a plan is a row
  in that table and never a product somebody has to remember to create in the
  Stripe dashboard — which is what keeps the number on `/pricing/` and the
  number that leaves a card the same number by construction.
  `test/seo.test.js` reads the exported table and asserts **both ways**: a plan
  with no `Offer` on `/pricing/`, and an `Offer` no plan backs, each fail.
  `test/llms.test.js` reads every figure `/llms.txt` quotes against the same
  page. Adding a third plan is a row and a second `Offer`; forgetting either
  half is red.
- **A plan the table does not hold is monthly, and monthly writes nothing.**
  `planOf` whitelists against the table itself (`hasOwnProperty`, so
  `constructor` is not a plan), and the default adds no metadata, exactly as
  English adds no `locale` — so a monthly purchase is the Stripe request this
  function always sent, byte for byte, and nothing a browser can be made to
  send charges a price this repo does not carry.
- **One primary action per screen, so the switch is a segmented control and
  never a second buy button** (the style skill, rule 8). Both figures and both
  sentences are written into the page by the build, in the reader's language;
  `plan.js` only decides which of them is hidden. A switch therefore cannot say
  a price the build did not write, ships no sentence of its own to translate,
  and degrades — no JS, no keys, a crawler — to the monthly page it has always
  been. `plan.js` loads **after** the page's own script, because deferred
  scripts run in document order and the listener (`signup.js` on `/pricing/`,
  the checkout script on `/checkout/`) has to be hearing the `plan` event
  before a `?plan=` in the URL is announced.
- **Since #1097 every buy button but the Close page's opens the studio's
  sign-up** (`site.studio` + `/signup`, `?lang=` on a translated page): the
  buyer signs in there, answers website, what to find and plan, and then meets
  Stripe. `signup.js` adds `website`, `plan=yearly`, `referral` and the utm_*
  keys, never `via`; `create-checkout-session` ignores `via` from the studio
  door, so the Close free month belongs to `/integrations/close/` alone, which
  keeps its own form, `buy.js` and `/checkout/`.
- **The choice crosses pages as `?plan=`, never as storage.** That is the path
  a yearly buyer takes when there are no Stripe keys and `/pricing/`'s CTA is a
  link rather than a form — and it declares nothing to `consent.js`'s
  inventory, because nothing is kept on the visitor's device.
- **`/checkout/done/` shows what was bought, not what is usual.** It printed
  `$999/mo` as a constant until #542; `checkout-session-status` now answers
  `plan`, which is **the only** thing that crosses from a session's metadata —
  the domain, the company and the buyer's target sentence stay server-side, and
  `test/checkout-session-status.test.js` pins that they do.
- **The billing gate is interval-agnostic, and that was verified rather than
  assumed.** `stripe-webhook.js` keys on the event type and the address and
  reads nothing about money; the studio's #68 cascade gates on suspension
  reasons. A yearly renewal is the same five events twelve months apart.
  `test/stripe-webhook.test.js` drives a yearly invoice through both halves, so
  a future line that starts reading an interval, an amount or a price id turns
  red.
- **Switching an existing workspace between plans is a mailto, and the copy
  says so** — `/pricing/`'s FAQ and `/terms/` §02 both name `hello@`. It stops
  being a sentence and starts being a button when billing is self-serve, and
  not before.
- **Nothing counts plans.** A third one can only turn the suite red by having
  no `Offer`, no `billingPeriod`, or a figure `/llms.txt` contradicts — the
  #131 rule, that friction points at the defect and never at the work.

## The demo contract — the tour, captured, and held to the product (#767)

`/demo/` is Reevo's Storylane shape on this site (the operator, 18 Sep 2026:
*"We should also have a clickable demo like this"*): the real screens, one
element lit, one sentence, Next, no account. **Nothing on it is written here.**
The studio's one-minute tour (`TOUR_STEPS` in `public/studio.js`, three chapters
since #766) is the one source, and `tools/demo-capture.js` reads it off the
running product: it starts the studio from the sibling checkout the way the
studio's own `dev/drive-tour.js` does, signs in through the dev door as the
example's own seller (Ledgerpost, pitching Harborline Freight), walks the ten
steps, and writes `data/demo.json` (the ring as fractions of the screen, the
title and sentence in every language the studio's catalogues hold, the chapter,
the names each step declares, the studio commit) and one PNG per step under
`src/assets/img/demo/`. `src/demo.njk` renders one figure per step and
`demo.js` shows one at a time, the hash the only state; every control is a
link, so the page walks with no script too.

- **Why a capture and not a public door on the studio.** `ROADMAP.md` #766
  recommended serving the demo from the studio over the example workspace.
  There is no example workspace: the example is a front-end constant drawn
  inside a signed-in shell that renders no screen without a session, so a demo
  door is a new anonymous surface on the product's auth layer, a studio row
  with a security pass. What that recommendation was for was rot, and rot is
  held here another way.
- **Every sentence the demo says is one the studio says.** Each step's title
  and body are `t('…')` strings in the studio, so they are in the vendored
  inventory `data/studio-strings.json` (#745). `test/demo.test.js` fails by
  name, saying `npm run demo:capture`, the day `npm run strings:snapshot`
  brings back a catalogue without one of them: a tour rewrite reaches this
  repo with the same lag and the same catch as the articles' names. The names
  a step declares are checked the way the studio's `dev/tour-coverage.js`
  checks them, with the same `says`.
- **The capture hides three things and nothing else**, all of them true of the
  capture and of nothing a visitor looks at: the dev server's own notice that
  runs are simulated, Counterprospekt's note that its competitor reading never
  landed, and a fresh member's account nudge. The tour's own overlay is hidden
  for the shot because the page draws its own ring and card.
- **Leads for you shows leads, and they are the example's own** (#1156). With
  no API key the setup search fills the shelf with bracketed gaps, and hiding
  them left step 2 a blank strip. The capture seeds its throwaway workspace
  instead, through the studio's `lib/shelf.js`, with the three lookalikes
  `public/example-pitch.js` draws under Harborline Freight: invented names
  the studio's own tests keep invented, each with the studio's fit and the
  studio's one-line why. Nothing on the tiles is written here, and no real
  company is named.
- **The card sits under the screen, never over it.** The rings are mostly the
  right-hand panel, so a card over the screen would cover what it points at,
  and a card below scales to a phone without covering anything. The end card
  is the free scan, this site's *Book a live demo*: a stranger gets a real
  result on their own domain where Reevo shows somebody else's.
- **The PNGs live under `/assets/img/`**, which the asset contract leaves
  unhashed on purpose, so a re-capture rewrites them in place and a day's cache
  picks them up. A build needs neither a browser nor a second checkout.
- **Nothing counts steps, chapters or languages.** A twelve-step tour builds a
  twelve-figure demo; a fourth catalogue in the studio lands in the JSON at the
  next capture; the only red is a sentence the studio no longer says, a name
  nothing says, a screen missing from disk, or a ring off the screen.

## The voice contract — the humanizer standard (#640, out of the studio's #634)

The studio's copy has been held to the humanizer standard since #634:
`/humanizer` (`.claude/skills/humanizer/SKILL.md`, blader/humanizer, MIT, built
on Wikipedia's *Signs of AI writing*), `findTells()` in `lib/humanize.js`,
`npm run humanize`, and a ratchet in `npm test`. This site is written in the
same voice by the same threads and had no such check. Measured before anything
changed, 13 Sep 2026: the funnel said 450 distinct strings and **124 of them
used a dash as the connector** (one string in four), the scripts 25 in 84, the
mails 17 in 48, the legal pages 192 in 391, the articles 331 in 2,532, and
the articles carried 43 strong tells besides. The words were nearly clean: one
*leverage* and one not-X-but-Y on `/what-to-send/`. So the tell in this site's
own copy is §8, dashes as the universal connector, the same as the studio's.

- **The patterns are the studio's, unchanged.** `lib/humanize.js` is
  `lib/humanize.js` in `prospektor-ai/studio` as CommonJS, so the two repos
  disagree about nothing: a *strong* tell (the not-X-but-Y contrast, the
  one-line closer, the saying that sounds deep, the run-up, arguing with
  nobody, the stock vocabulary, inflated significance, sales dressing, chat
  residue, the greeting-card mail opener) justifies an edit on one sighting;
  a *weak* one (a dash, a stacked qualifier, a dressed-up verb, *actually*)
  is counted and reported. Exempt: a URL, inline code (a `<code>` element
  reads as one), a `{placeholder}`, a quoted phrase, an unspaced en dash in a
  range, a hyphen inside a word.
- **What is read, and from where.** `tools/humanize.js` reads the **funnel**
  off the BUILT English pages, block by block, the way a visitor reads it (so
  a sentence from frontmatter, `site.json` or a `{% t %}` block is one
  sentence wherever it was written, and the nav counts once), plus `/llms.txt`
  and the help hub's own sentences off the inventory; the **legal** pages,
  derived from `site.legal`; the **resources**; the **scripts** (every `t('…')`
  a browser can say, off `lib/i18n.js`'s inventory); the **functions** (the
  welcome email's sentences, the operator notices, and every reply a function
  hands the browser, as the string literals of every file under
  `netlify/functions/` and `netlify/lib/`); and **one surface per catalogue**,
  its values. NOT read: `/help/` and its guide pages, which are the studio's
  corpus rendered here and the studio's #639.
- **`npm test` is red on a strong tell, anywhere, and on a dash count rising
  past its ceiling.** The ceilings are `CEILING` in `tools/humanize.js`, one
  row per surface, and the test also fails when a count has fallen well
  *under* its ceiling, naming the number to write, so a thread that rewrote
  a page records the gain and the next thread cannot spend it. The funnel,
  the scripts and the functions are at **zero** and stay there. The legal
  pages hold at 187: two of them carry wording still unmerged on the
  operator's desk (#529, #531), and nine of `/privacy/`'s sentences are pinned
  by name in the studio's `test/privacy-claims.test.js`, so a dash there is
  that row's to remove. The articles hold at 304 dashes and 43 strong tells,
  the one surface with a ceiling on strong tells, because 43 across
  twenty-six articles is a row of its own and a check that demanded zero in
  one thread would be deleted.
- **A string is a paragraph, never a source line (#738).** Until 18 Sep 2026
  `htmlBlocks()` split a built page on raw newlines as well as on block tags,
  so the 2,532 "strings" `/resources/` reported were markdown lines: a
  not-X-but-Y that wrapped (*is not X.* ⏎ *It is Y*) was never matched, a
  quoted phrase that wrapped lost its exemption, and a paragraph was measured
  as its longest line. The reader now folds a block's newlines first. That
  moved every page surface's count at once on the same copy (the funnel 483
  strings to 368, 17 past forty words to 34; the articles 2,531 to 1,243; the
  legal pages 395 to 353), so the ceilings were re-based in the same push, and
  `test/humanize.test.js` pins a wrapped tell and a wrapped quotation. The
  studio's readers already read paragraphs and text nodes, so nothing changed
  there.
- **A translation keeps its own language's punctuation.** The raya and the
  Gedankenstrich are those languages' punctuation, not a tell; the rule lives
  on the English key, and rewriting an English sentence RE-KEYS its three
  translations with the values untouched (`test/i18n.test.js` is red on a
  stale key). Each catalogue has its own dash ceiling so the count is watched;
  a fourth language lands with no ceiling row and is reported, not red.
- **How the rewrite was done, and how the next one should be.** Judgment,
  string by string, never a substitution: a period where the second clause
  stands alone, a comma or parentheses where it was an aside, a colon where
  it introduced a list, a middle dot in a label-and-figure pair (*Pay & start ·
  $999/mo*) and in the `<title>` pair, which is the studio's own choice for
  its title pair. The seven tells this site's copy actually commits, dashes
  first, are the studio's `/style` list: no dashes; never *not X but Y*; no
  one-line closer and no row of fragments; no run-up and no arguing with
  nobody; none of the §12 words, and plain verbs; nothing from a chat or a
  greeting card; lists as long as the meaning. `npm run humanize -- funnel`
  lists what is left, longest first; `/humanizer` on one string rewrites it
  without changing what it says.
- **Nothing counts strings, pages or languages.** Adding a page adds its
  sentences to a surface already measured; adding a script adds its `t()`
  sentences to the scripts; a new function's literals join the functions. Any
  of them can only turn the suite red by carrying a strong tell or a new dash,
  the #131 rule.

## The language contract — the English sentence is the key (#114, #535)

Every page a visitor reads — the funnel (`/`, `/pricing/`, `/checkout/`,
`/checkout/done/`), the two product pages, `/contact/` and its thanks page, the
cookie notice on all of them and, where the studio holds the corpus in the
language, `/help/` — is served in Spanish, German and Dutch under `/es/`,
`/de/`, `/nl/`; `/` stays English for a visitor who never chose. The convention
is #113's, carried over from the studio where it transfers, and the reasons are
the same.

- **One catalogue file per language, and the English sentence is the key.**
  `src/_data/strings/<code>.json` is `{ "English sentence": "translation" }`.
  There is no English catalogue to be incomplete and no key that can render
  raw: a sentence a catalogue lacks renders in English and is logged once at
  build time, never thrown. **Untranslated is reported, never red** — a feature
  ships its English in the code that uses it and `npm run i18n:coverage` lists
  what a sweep should catch up on (#113, #131). Red is reserved for what rots
  silently: a catalogue entry for a sentence the site no longer says, a
  translation that drops a `{placeholder}`, a `{% t %}` block the extractor
  cannot read (`test/i18n.test.js`).
- **English is a no-op, byte for byte.** `lib/i18n.js` returns the key
  untouched for `en` before it looks anything up, so the English pages are the
  pages the build wrote before #114 — checked by diffing a pre-#114 build
  against a post-#114 one on the day it shipped: additions only (hreflang, the
  switcher, the payload), not one moved byte. Keep it that way: wrap a
  sentence, never rewrite it to make it wrappable.
- **A language exists exactly when its catalogue does.** `lib/i18n.js`'s
  `built()` is the list. The funnel templates paginate over it
  (`pagination: data: languages`) to write one page per language; the layout
  derives `<html lang>`, `hreflang` (every sibling, itself and `x-default`
  included — SEO-AUDIT.md R5), `og:locale`, the footer switcher and the nav's
  hrefs from the built page list; `sitemap.njk` derives the twins the same
  way. Nothing lists `/es/` anywhere. Delete `es.json` and every one of those
  leaves the same way.
- **How copy is written.** `{% t %}…{% endt %}` around a sentence in a
  template, markup inside allowed — **a link inside a sentence stays written
  English-side** (`href="/pricing/"`) and the shortcode localizes it on the way
  out, translation or not; written as `{{ '/pricing/' | localize }}` inside the
  block it would render differently on every page and never match its key, and
  the extractor refuses it by name (#535). `{{ value | t }}` for a value that
  arrives in a variable (a frontmatter title, a site.json label, a `faqs:`
  entry — the inventory reads frontmatter through gray-matter, the parser
  Eleventy uses, so a YAML list is a list); `{{ value | t({ n: 3 }) }}` fills a
  placeholder. A miss is logged only for a sentence the inventory knows: a
  value the studio already serves in the page's language (a help guide's
  title) is looked up like any other and falls back without a word. `t('…')`
  in a script
  under `src/assets/js/` (the page ships exactly the sentences its scripts ask
  for, inline, only where a twin exists — `i18n.js` defines `window.t` first
  on every page) and in a Netlify function (`netlify/lib/strings.js` carries
  the catalogues as literal requires, because a bundler ships what it can see).
  Internal hrefs go through `{{ '/pricing/' | localize }}`, which answers the
  twin where the build wrote one and the English page where it did not — so a
  link on a localized page can never point at a URL the build did not produce.
- **The browser's language nudges. It never redirects** (#114 → #544). On an
  English page, when the browser's first-ranked language (`navigator.languages[0]`
  — never the IP or a geo lookup: a German VPN is not a German reader) is one
  the page is built in, `src/assets/js/i18n.js` draws one line under the nav in
  that language — *Diese Seite gibt es auf Deutsch →* — which is itself the
  link to the twin, plus an × named *Not now* for a screen reader. Nothing to
  read, nothing to decide. **It is shown once per browser**: `prospektor.lang`
  (declared in `consent.js`'s inventory) is written the moment the line is
  drawn, so ignoring it counts the same as closing it, and taking it overwrites
  the flag with the language chosen. A translated page is never nudged — it was
  chosen — and the build sends it no `suggest` payload at all. Only the first-
  ranked language counts, for #113's reason. `test/i18n.test.js` fails on a
  `location.assign` in that file, on any sign of a geo lookup, or on an
  `Accept-Language` redirect in `netlify.toml`; `test/drive.js` §14 drives a
  Spanish browser onto `/` and proves all four: offered, not moved; ignored,
  not asked again; closed; taken. Nothing to add to `/privacy/` — a preference
  flag on the visitor's own device, the same class as the cookie notice's own
  remembered choice.
- **The scan says the language on BOTH requests, and English says nothing on
  either (#114 → #536).** `scan.js` reads it from `<html lang>` once, and one
  `langQuery()` decides what the GET adds: the POST carries `language` in its
  body, the poll carries `&language=` on the URL, and for `en` both are the
  request they were before #114. The poll is not decoration — since the
  studio's #534 a Spanish reading is **its own record beside** the English one,
  keyed `(domain, language)`, so a poll naming no language reads the English
  record and a Spanish visitor whose domain somebody already scanned in English
  was shown that English card while their own reading finished unseen. The
  studio bridges the case where only one reading exists, so a poll can never
  come back empty; naming the language is what makes it come back *right*. The
  reply's `language` says which reading answered — `"es"`, absent for English —
  and that is what `npm run audit` asserts against the live studio.
  `test/drive.js` §16 drives both halves.
- **Checkout speaks the buyer's language and English sends nothing.** The
  pages post `locale` only when it is not `en`; `create-checkout-session`
  whitelists it against the closed set and, for a hit, sets Stripe's own
  `locale` (a translated hosted page for one parameter), returns the buyer to
  the translated pages, and writes `metadata[language]`; the webhook welcomes
  them in it, tells the operator, and offers it to `/api/provision`. An
  English purchase is byte for byte the Stripe request and the email it always
  was — `test/checkout-session.test.js` and `test/stripe-webhook.test.js` pin
  both halves.
- **`/help/` is an EDITION per language, and the studio decides which exist
  (#535).** Since #113 Slice D `/api/help?lang=es` answers the same files with
  `language: "es"` where a translation exists and `"en"` where it does not —
  per document, so a page never goes missing. `src/_data/help.js` asks for
  one edition per built language and writes `/<code>/help/` and its guide
  pages **only when the studio holds at least one guide in that language**;
  the offline build reads the same answer from `data/help-corpus.<code>.json`,
  which `npm run help:snapshot` writes for exactly those languages and removes
  for the rest. German and Dutch answer today with every file in English, so
  they get no edition, no URLs, and their nav item falls back to `/help/` — a
  hub of English text under `/de/` would be duplicate content wearing a flag.
  Nothing lists `es` anywhere: the day the studio ships one German guide,
  `/de/help/` exists at the next build. A guide the edition holds in English
  is still written (a reader following the hub must never 404), says so above
  the text and on its card, carries `lang="en"` on the body, is `noindex` and
  is left out of the sitemap — its English twin is the page to rank. The
  scripts ask for the corpus in the page's language (`data-lang` on
  `#helpGuides`; `<html lang>` on a guide page) and the English fetch is byte
  for byte what it was; the not-yet-translated note is shown or hidden at
  runtime from the live answer, so #76's property holds in every language. A
  guide's title and body are the studio's, in the language it served them —
  no catalogue is asked for them, and a title past the ~60-character budget
  gives search its head before the studio's own dash (`seoTitle`), never a
  clipped one. `test/help.test.js` holds all of it; `test/drive.js` §7f
  drives the runtime half; `npm run audit` asks production.
- **What stays English, and why.** `/terms/`, `/privacy/` and `/dpa/` are
  COMPLIANCE's and not a translation job — pinned by
  `test/privacy-claims.test.js` in the studio repo, and two of them carry
  wording still unmerged on the operator's desk (#529, #531); `/resources/` is
  written, not translated (its nav item falls back to the English page, by
  the rule above); the scan card's guess and the free run answer in the
  language the studio chooses (#113, #534). The cookie notice is the studio's
  copy (#131 → #143) and stays a copy: its sentences pass through a local
  `t()` that defers to `window.t` where i18n.js has defined it and says the
  English anywhere else, so the file still drops into a site that has never
