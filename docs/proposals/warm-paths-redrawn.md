# Warm paths, redrawn

*A proposal for the studio's Warm intros screen: CTD's functional model in the
Origami look. Nothing below is built. Written 30 Sep 2026 against studio
`main` at `0d3847a` and the live screen at `studio.prospektor.ai/intro`.*

**Visual edition:** <https://claude.ai/artifact/RnAdLQXG6zBpvXoRM74ptx>,
regenerated from `warm-paths-redrawn.html` beside this file: four screens drawn
in the studio's own tokens, the CTD table, the build plan and the one question.

**Where this file belongs.** In the studio repo as
`docs/research/warm-paths-redrawn.md`, with a board row. It was written from
a website-lane session that holds the studio read-only, so it is committed here
and the studio-side filing is the hand-back at the end.

Operator ask, 30 Sep 2026, verbatim:

> one of the other big things I want to start working on is the actual "warm
> paths" feature. It can be (loosely) based on https://ctd.ai/venture-capital
> and this: https://ctd.ai/integrations-mcp. In other words - reserach how CTD
> does things and then make a proposal on how we can actually build this
> feature to look less random and underdeveloped. Because right now it's zero
> clear how to use it and what to do.

And on the look, a minute later: *"the styling should of course remain in line
with the 'origami.chat' look, but the functionality should be inspired by
CTD"*.

---

## In one paragraph

The engine under Warm intros is better than the screen over it. A search
already verifies each tie against a page it read, cites it, ranks the paths,
and writes the two drafts CTD sells as its headline feature. What the screen
shows is one empty field. It never says what network it is searching, it
answers nothing until a three-minute run is over, it files the answer in a log
under the form, and once the drafts exist nothing happens next. CTD's product
is the reverse shape: the network is a visible thing with a size, a search
answers instantly from it, a path is an object with a stage, and the research
is a second press. This proposal keeps the engine and every privacy rule, and
rebuilds the screen in that order: the network as a number, an instant answer
as you type, one coral press, the doors already open under it, and a path that
remembers whether you asked.

---

## 1 · Why the screen reads as random

Read against the 30 Sep screenshot of `/intro` and the code on `main`.

1. **The field floats in nothing.** The screen searches a network it never
   shows. `GET /api/intro` already answers `network.imported`, the count of
   entries across every import (`netlify/functions/intro.js`), and
   `renderIntro` in `public/studio.js` reads only `network.ready` from it. A
   member with 312 connections and one with a pasted list of two see the same
   empty field and have no idea what "Find the path" will look through.
2. **The instant half is hidden.** `matchNetwork` in `lib/whoCouldHelp.js`
   answers *who do you know at this company* from the imports alone: no model,
   no third party, milliseconds, free. It is served at
   `/api/who-could-help?job=` and drawn as *Already in your network* on a
   finished pitch's Warm paths panel, and nowhere else. On `/intro`, typing a
   company changes nothing on the page, and the only answer the screen can
   give costs a run and takes up to three minutes (`PATHS_DEADLINE_MS`).
3. **The field is a plain text box.** Every other company box in the product
   is the `/api/companies/suggest` combo (#823 says so of Outcomes); this one
   is `<input type="text" id="intro-subject">` (`public/index.html:638`), so
   a typed name is not resolved to a website before `runIntro` hands it to
   the engine as `{ company: subject.name, website: null }`.
4. **The answer is a log.** Results are *What you have asked*, the twelve
   newest intro jobs (`RECENT = 12`), each a `.rival-list` and a folded
   draft under a `details`. A first-time member presses the button, sees
   *Searching your network…* appear under the form, and three minutes later a
   list lands there. No count, no headline, no state; a second ask pushes the
   first down the page.
5. **Nothing happens after the draft.** The best path carries the ask and
   the onward email (#356), each with a Copy. There is no *asked*, no *they
   said yes*, no *meeting*, and no hand-off to Outcomes, which is the screen
   that teaches the next pitch. CTD's product is what happens after the path
   is found: the ghost email's send, the path's stage, the conversion
   number. Ours ends at the clipboard.
6. **The network has no shape.** Your network is an importer. Two days after
   #877 moved it under Warm intros it still wears the Teach eyebrow
   (`public/index.html:1381`), its fine print sits behind an ⓘ, an import is
   a row with a count, and the five tiers `strengthOf` computes from the
   message tally (strong, warm, light, unknown, one-way) are shown nowhere on
   the screen that holds them.
7. **The second direction sits under a seller's field.** *Or find someone
   worth meeting for a contact you know* is a different job (an investor's or
   an agency's) and the only sentence on the screen besides the title. #820
   was right to fold it to one line; it is still the first thing a reader's
   eye finds under the button, and it explains the wrong thing.
8. **The machine surface needs a pitch.** `find_warm_paths` takes a `pitchId`
   and nothing else (`lib/mcp.js:225`), so a Claude that is asked *who do we
   know at Harborline* has to buy an eleven-minute pitch first. CTD's MCP
   answers a company, a person or a connector directly, and separates the
   instant question from the researched one.

**What already works and stays.** The engine: every path starts with somebody
in the network, every tie is verified against a page or a line of the
member's own data and cited, `strong` or `possible`, at most five
(`PATH_CAP`), a budget sized on the connectors (#609), a three-minute clock,
an honest empty answer with a note, and the two drafts under 100 words each.
The tally tiers (#355). The agency lending by reference (#353) and the roll-up
console (#452). The privacy posture: no addresses stored, no OAuth, the
studio contacts nobody, nothing network-shaped on a share.

---

## 2 · How CTD does it, and what transfers

Read 30 Sep 2026 off `ctd.ai/venture-capital`, `ctd.ai/integrations-mcp`,
`ctd.ai` and the public guide. The mechanism teardown is
`docs/research/ctd-teardown.md` (#354, 28 Aug) and is not repeated; two of its
rows (#355, #356) have since shipped.

**Their model, in the five steps their own page uses.**

1. **Onboard the network.** Email by OAuth (headers by default), LinkedIn as
   the member's own `Connections.csv` and `messages.csv`, CRM sync. An admin
   creates the accounts; members opt in to add their own inbox.
2. **Build the graph.** Deduplicate, score, make it searchable. Four tiers
   from two-way traffic and recency; one-way traffic scores zero; a bare
   connection is weak; Business tier adds predicted ties from shared tenure.
3. **Search any target.** A person, a title, a company. Instant, from the
   graph. Ranked by strength. The result reads as one line before it reads
   as a list: *"142 warm paths · 31 strong"*, *"100 warm paths · 20 strong ·
   5 to the CXO suite"*. A company page lists everyone reachable there.
4. **Activate.** The ghost email: the requester writes the intro in the
   connector's voice, the connector sends, edits or declines, the requester
   is copied on the reply. Business adds an approver in front of the
   connector. Volume and conversion are tracked, and a path has a pipeline
   stage (`update_path_stage` on the MCP).
5. **Expand.** Portfolio founders and advisors as external members, target
   lists, job-change alerts, a Claude connector with fifteen verbs.

**What transfers, and what does not.**

| CTD | Ours today | Take? |
|---|---|---|
| The network is a visible thing with a size and tiers, at the top of search | Hidden; `imported` is answered and never shown | **Take** |
| Search answers instantly from the graph; research is a second step | The instant half exists only on a finished pitch's panel | **Take** |
| A count line before the list (*N paths · N strong*) | None | **Take** |
| A path has a stage; conversion is a number | None; the draft ends at Copy | **Take**, and feed `recordOutcome` |
| Ghost email: the connector's draft, then the send | The draft exists (#356); no send | **Take the zero-OAuth half**: a `mailto:` with the draft prefilled, #34's rung 0 |
| Target lists mapped to paths | The roll-up, agencies only (#452) | **Take for every workspace**: the shelf and the library are the list |
| Reimport is a diff; a six-month reminder | Re-upload replaces | **Take** |
| MCP verbs: paths to a company, to a person, via a connector; company details; stages | One verb, gated on a pitch | **Take four verbs** |
| Email OAuth ingestion | #34, on the operator (Google or Microsoft first) | Not this row |
| Predicted ties from shared tenure | The engine never invents a connector | No |
| One graph across every customer | Tenant-scoped by construction | No |
| Sending from the connector's mailbox; an approval chain | The studio contacts nobody | No |
| Job-change alerts | #238, #298 | Already rows |

---

## 3 · The proposal, five screens

**The look is the Origami shape and nothing else** (#875, #877, #878): one
card, the segment strip at its head, the eyebrow chip, one coral press per
screen, no paragraph under a button, detail folded, provenance kept (`/style`
rules 5, 8 and 10). CTD decides what the screen *does*; it decides nothing
about how it looks. Every sentence below is a candidate string and is written
under the humanizer standard.

### Screen 1 · Warm intro, with a network

- **Strip:** Warm intro · Your network. Unchanged.
- **Title:** *Who can introduce you?* Unchanged. Under it, the one line the
  screen was missing, the network as a number: **312 people from 3 imports ·
  41 who actually talk to you.** Both figures come off `listNetworkFor` and
  `strengthOf`; the line is a link to Your network. A workspace with a brief
  Network section and no import reads *Your brief names 6 ties.*
- **The box:** the company combo every other screen has, so a name resolves
  to a website. As it resolves, under the field and before any press, the
  instant answer from `matchNetwork` and `briefNetworkMentions`:
  **2 people you know are at Harborline Freight**, then the top three as rows
  (name · role · tier chip · *known to Nils, LinkedIn*), or
  **Nobody you know is there. The path would run through who they know.**
  Nothing is spent and nothing is stored; it is `/api/who-could-help` given a
  target instead of a job.
- **One coral press:** *Find the path.* The run, exactly the POST that exists.
- **Doors, under the box:** *Who you know at the companies you are working
  on.* `rollUp` from `lib/portfolio-paths.js` for a portfolio of one: the
  shelf and the library are the targets, the workspace's own network (and
  what its agency lends) is the graph, basis then strength is the order.
  Each row: company · the best door and why (*works there* / *their role
  names them* / *your note names them*) · tier · one ghost *Find the path*.
  Free, deterministic, and the reason the screen is never empty the moment a
  network exists.
- **The contact direction** stays the one quiet line #820 made it. The
  screen's sentence count is the title, the number line, the field, the
  instant answer, the press, the line.

### Screen 2 · A path, found

- **The card's head is the count line:** *Harborline Freight · 2 paths,
  1 strong.* Then the rows, best first: *You → Dana Ruiz → Harborline
  Freight* · strong · the why in one line · *source ↗* or *from your own
  network* · how you know them.
- **The best path open, the rest folded.** The ask, *to Dana* (Copy · Open in
  Mail), and under it *the email Dana sends on, to Harborline* (Copy). *Open
  in Mail* is a `mailto:` carrying the subject and the body and **no
  address**: the studio holds none, so it cannot fill one in, and it still
  sends nothing. That is #34's rung 0, unblocked since 22 Aug.
- **The path remembers.** Under the drafts, one row of chips: *Asked · They
  said yes · No · Meeting booked.* A press writes `stage` and `stagedAt` on
  the intro record (or the pitch's `warmPaths` marker). *Meeting booked*
  opens Outcomes with the company filled in, the way a card's *Add a note*
  does, so the pitch after this one is written from what happened.
- **One renderer.** `introFinding` on `/intro` and `warmPanel` on a finished
  pitch draw the same card; today they are two functions with two shapes.
- **What stays:** *Also looked into, nothing found: …*, *Look again*, the
  honest empty answer and its note, *Stays with your team.*

### Screen 3 · Your network, as a graph summary

- **Eyebrow** Warm intros, no longer Teach. **Title** Your network.
- **One-look strip:** *312 people · 118 companies · 41 strong · 3 imports ·
  last import 12 Sep.* Under it a tier bar drawn from `strengthOf`: strong,
  warm, light, unknown, one-way, with the counts. A workspace with no tally
  sees one segment and the line *Add the message tally to rank them.*
- **Imports as rows** (kept): kind · label · who brought it · count · date.
  A row older than six months carries *Refresh* on the right, which opens
  that door; the reminder is a line on the row, never a mail.
- **The paste box stays the one act**, the two file doors stay ghost buttons.
  The fine print leaves the ⓘ and becomes the two lines under the file
  doors it already is on the door guides.
- **Reimport merges.** A re-uploaded `Connections.csv` adds and updates by
  profile URL, keeps the tally on every row it already had, and keeps a
  connection LinkedIn has since dropped, until the member removes the import.
  One sentence changes in `DATA-HANDLING.md` §3d and on `/privacy/` §06 in
  the same push.

### Screen 4 · First visit, no network

- **One step, and the doors on it.** *Bring in who you know* stays the whole
  screen, and the paste box and the two ghost file doors sit inside the step
  instead of behind *Open Your network*. Nobody is sent to a second tab to do
  the first thing.
- **The first import turns the step into Screen 1** without a reload, and
  ticks *Bring in who you know* on the Next steps card (`facts.network`
  already does).

### Screen 5 · The machine surface

Four verbs in CTD's shape, on `/api/v1` and the MCP, each with its scope
already in `whoami`:

| Verb | Does | Costs |
|---|---|---|
| `who_do_we_know({ company })` | The instant answer: who in the network works there, whose role names it, whose note names it, and the brief's mentions | Nothing |
| `find_warm_paths({ company })` or `({ pitchId })` | The existing verb, widened: a company name or website starts an intro job; a pitch id lands on the pitch as today | A run |
| `list_doors()` | Screen 1's Doors: every company on the shelf or in the library that somebody in the network reaches, ranked | Nothing |
| `record_intro({ id, stage })` | The path's stage, the same four values as the chips | Nothing |

The asks a Claude can then answer, in CTD's own register: *"Who do we know at
the ten companies on my shelf?"*, *"Find the path into Harborline Freight and
write the ask"*, *"Mark the Harborline intro as asked"*. The help guide
`12-connect-your-claude.md` and `RUNBOOK-connect-claude.md` gain the four
lines; the website's `/help/` and `/llms.txt` follow at the next snapshot.

---

## 4 · What stays exactly as it is

- `lib/warm-paths.js`: the prompt, the tool schema, the budget, the clock,
  `normalizeWarmPaths`, the two drafts, `simulateWarmPaths`.
- `lib/whoCouldHelp.js` and `lib/network.js`: the matcher, the tiers, the
  door rules (addresses dropped, the tally's four facts, one member's consent
  one record).
- `lib/intro.js`'s contact direction, and its one quiet line on the screen.
- The agency console at `/paths` (#452): it stays the cross-workspace view
  for an agency; Screen 1's Doors is the same `rollUp` on one workspace.
- Every privacy sentence: nothing new is stored about a third party, no
  address is held, no mailbox is connected, the studio contacts nobody,
  nothing travels on a share. The only new stored fields are a stage and a
  date on a record the workspace already owns.

---

## 5 · The build, four slices

In order, because every slice edits `public/index.html`, `public/studio.js`
and `public/studio.css` on the same section; one thread per slice, the
#875 rule. Sizes in the board's scale.

| Slice | What | Files | Checks | Size |
|---|---|---|---|---|
| **1 · The screen** | The number line, the company combo, the instant answer under the field, Doors, the first-visit step with the doors on it | `netlify/functions/intro.js` (GET gains `network.strong`, `network.companies`, `doors`); `lib/portfolio-paths.js` (`doorsOf(brief)` beside `rollUp`); `netlify/functions/who-could-help.js` (accept `company` + `website` as well as `job`); `public/studio.js` `renderIntro`, `renderIntroRuns`; `public/index.html` `view-intro`; `docs/help/02-screens.md`, `05-network.md`; three catalogues | `npm test`, `npm run drive:intro` rewritten to the new shape, `npm run tour:coverage`, `npm run help:coverage`, `npm run humanize` | M |
| **2 · The path** | The count line, one renderer for `/intro` and the pitch panel, Open in Mail, the stage chips, the Outcomes hand-off | `lib/intro.js` (`STAGES`, `stage`, `stagedAt`); `netlify/functions/intro.js` (PATCH); `netlify/functions/pitch-paths.js` (the same on `warmPaths`); `public/studio.js` `introFinding` + `warmPanel` → one `pathCard`; `lib/outcomes.js` untouched (the hand-off is the existing open-with-company) | `npm test`, `npm run drive:intro`, `npm run drive:wait` (the pitch panel), `DATA-HANDLING.md` one sentence on the two new fields | S |
| **3 · The network** | The eyebrow, the one-look strip, the tier bar, Refresh on a stale row, reimport as a merge | `lib/network.js` (`summarizeNetwork`, `addImport` merge for `linkedin`); `netlify/functions/network.js`; `public/studio.js` `openNetwork`; `DATA-HANDLING.md` §3d; `LIA-contact-graph.md` §1a one line; website `/privacy/` §06 (a website row, same day) | `npm test`, `test/network-messages.test.js` gains the merge case, `npm run privacy:claims` on both repos | S |
| **4 · The verbs** | `who_do_we_know`, `find_warm_paths` widened, `list_doors`, `record_intro` | `lib/mcp.js`, `lib/verbs.js`, `netlify/functions/v1-paths.js` and two new doors; `test/mcp.test.js`; `docs/help/12-connect-your-claude.md`; `RUNBOOK-connect-claude.md` | `npm test`, `npm run drive:mcp` if one exists, else the mcp test's roster | S |

**The website half**, checked here by `npm test`: `npm run strings:snapshot`
after each slice (the articles' `names:` and `/demo/` are held to the
inventory), `npm run help:snapshot` when the two guides change, and
`npm run demo:capture` only if the tour's Warm intro step moves (slice 1
changes the screen the step rings, so expect it).

**No new spend surface.** The instant answer, Doors, the strip, the stages
and three of the four verbs call no model. The one press that spends a run is
the POST that spends one today.

---

## 6 · What to read before and after

Three numbers, all readable from the store with `npm run effort` and one
census script, so the next thread can say whether this worked rather than
whether it shipped:

- **Time to the first answer on `/intro`.** Today: the run's `ms` (median
  188 s on the production store, #609). After: the instant answer, under a
  second, on every resolved name.
- **Intro runs that end in a stage.** Today: no field to count. After: the
  share of finished paths with any stage, and the share at *Meeting booked*.
  That is CTD's conversion number, ours for the first time.
- **Doors on open.** How many rows Screen 1 shows on a workspace with a
  network and a shelf. Zero on a workspace with both is a bug in the matcher,
  which `test/portfolio-paths.test.js` already covers for the agency shape.

---

## 7 · The question

**Build it as drawn?**

- **A** · yes, four slices in order, one thread each (recommended).
- **B** · slices 1 and 2 only; the network summary and the verbs wait for a
  customer to ask.
- **C** · name the screen to redraw first.

A yes turns into four board rows with reserved ids and this file moved to
`docs/research/`; a no or a rewrite goes on the row.

---

## Sources

Fetched 30 Sep 2026: <https://ctd.ai/venture-capital> ·
<https://ctd.ai/integrations-mcp> · <https://ctd.ai/> ·
<https://ctd.ai/guide/article/individuals-finding-paths> ·
<https://ctd.ai/guide/article/mcp-capabilities> · <https://ctd.ai/llms-full.txt>.
In the studio repo: `docs/research/ctd-teardown.md` (#354), `ROADMAP.md`
#497, #609, #820, #875, #877; `lib/warm-paths.js`, `lib/intro.js`,
`lib/network.js`, `lib/whoCouldHelp.js`, `lib/portfolio-paths.js`,
`lib/mcp.js`, `netlify/functions/intro.js`, `public/studio.js` (the intro,
network and warm panel sections), `public/index.html`, `docs/help/05-network.md`,
`DATA-HANDLING.md` §3d, `BOARD.md` #34.
