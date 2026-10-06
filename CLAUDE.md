# Working in this repo

This is the **WEBSITE lane** of Prospektor: prospektor.ai, an Eleventy
static site with Netlify functions. The product itself (Prospektor
Studio — renamed from "Partner Studio", 21 Aug 2026) lives in
`prospektor-ai/studio` — the master board is that repo's `BOARD.md`
(its archive is `ROADMAP.md`), and this lane's contract file is
`HANDOVER-website-funnel.md` there. Read all three before starting
anything; the handover documents the studio's live endpoints
(`/api/scan`, `/api/provision`) and everything needed to build against
them without reading the studio's code.

## Thread protocol

1. **Every thread's opening message starts with the lane and deliverable on
   the first line**: `WEBSITE — the scan field`. One deliverable per thread.
2. Start by reading the handover file (and BOARD.md / ROADMAP.md) in
   `prospektor-ai/studio`. **That repo is private** (found 21 Aug 2026),
   so website sessions must be launched with `prospektor-ai/studio`
   attached in scope — until the operator either restores public
   visibility or changes this protocol, a session that cannot read it
   should say so and stop rather than guess at the contract.
3. **Before pushing: `npm test`** (154 tests, no network, no keys).
   If the change touches a page or a client flow, also `npm run drive` —
   it builds and drives the built site in a browser with the functions
   mocked. `npm run build` must of course succeed.
   After deploying, `npm run audit` asks **production** whether this board is
   still telling the truth: one claim per board row, read-only, safe to run any
   time. It is how `app.prospektor.ai` was found still serving the pre-pivot
   agency page that the log had recorded as gone.
   **`npm run help:snapshot`** refreshes `data/help-corpus.json`, the last-good
   copy of the studio's help corpus that `/help/` falls back to when the studio
   cannot be reached at build time (#136). Run it when the studio ships help
   changes; the build prefers the live endpoint and never fails without it.
   **Since #166 the snapshot decides how many PAGES the build writes**, not just
   what one page says: every guide in the corpus gets `/help/<slug>/` and a
   sitemap entry — and since #535 the snapshots decide which LANGUAGES the help
   section exists in: `data/help-corpus.<code>.json` is written only for a
   language the studio holds a guide in, and `/<code>/help/` exists offline
   exactly when that file does. A stale snapshot is therefore a stale set of URLs — the site
   still shows a newly-added guide (the hub renders it inline at runtime, and an
   edited guide corrects itself on its own page), but it has no URL of its own
   until the next build. See *The help contract* below.
   **`npm run learnings`** prints the `/resources` coverage report — see
   *The resources contract* below. **`npm run resources:coverage`** asks whether
   `/resources` still tells the truth about the product: every screen,
   button or verb a surface declares in `names:` against the studio's
   string inventory vendored in `data/studio-strings.json` and the help
   snapshot, and every link into `/help/` and `/resources/` against
   the pages that exist. It is the website half of one checkpoint whose
   other enforcer is the studio's `dev/tour-coverage.js` (#744, #745):
   a meaningful product change updates the tour there and the articles
   here, checked rather than remembered. **`npm run strings:snapshot`**
   refreshes the inventory from a studio checkout beside this repo; run it
   when the studio renames something, and commit the result. **`npm run humanize`** prints the copy
   against the humanizer standard, surface by surface — see *The voice
   contract* below; `npm test` is red on a strong tell anywhere and on a dash
   count rising past its ceiling, so read the seven tells there before
   writing a sentence a visitor reads. **`npm run og`** re-renders the article
   Open Graph cards with Playwright and commits the PNGs; run it after adding
   or retitling an article, or after changing a `topic:`, since the card shows
   it. It is an authoring step, never a build step — the Netlify build must
   not need a browser. **`npm run demo:capture`** is the same kind of step for
   `/demo/`: it walks the studio's one-minute tour over the real screens from
   a checkout beside this repo and commits the screens and the sentences; run
   it when the studio ships a tour change, and `npm test` names it when the
   strings snapshot says the tour has moved on — see *The demo contract*.
4. A deliverable is not shipped until the handover file in the studio repo
   is updated to record what was built and what was decided — that update
   is a STUDIO-repo commit, named in the sign-off.
5. **A thread is not done until its work is LIVE.** This site deploys from
   `main`. Merged there, pushed, and **asked of the live site** — fetch
   `https://prospektor.ai/…` and confirm the new element, the new href or
   the changed copy is actually being served. A green build is not a deploy
   and the commit log is not verification: on 18 Aug the studio spent three
   days serving a build from three days earlier while every lane's board
   said the work was shipped.

   **A change with no page byte to ask about has one anyway** (#698, out of
   #684, where two serverless fixes shipped on trust). Every response from
   `checkout-session-status` carries `commit`, the sha the build was made
   from, written by `tools/build-stamp.js` from Netlify's `COMMIT_REF` before
   the functions are bundled. So the check for a function-only ship is the
   merge sha coming back from production:

   ```bash
   curl -s https://prospektor.ai/.netlify/functions/checkout-session-status | grep -o '"commit":"[0-9a-f]*"'
   ```

   Until it answers your sha the deploy has not landed. `npm run audit` asks
   the same question on every run and compares it with the checkout it runs
   from. The committed stamp is `null` and a test keeps it so; a local build
   never writes a sha. If a deploy must wait on an operator decision
   or on keys that are not set, say so in the sign-off as an explicit
   hand-back — that is the only acceptable way to end a thread with work
   not live.
6. **Write the operator's asks down before building them.** An instruction
   given in chat and not recorded in the studio repo's `ROADMAP.md` gets
   dropped, or built to a different spec and marked done: the pricing CTA
   was asked to go straight to Stripe, was built as a link to `/checkout/`,
   and the board recorded a "direct pay path" as shipped for three days.
7. **Cross-lane requests never travel as chat context.** Anything the
   studio side must change or answer is written into the studio repo's
   relevant handover file (dated, under *Requests from other lanes*).
8. **Secrets stay server-side.** `STUDIO_PROVISION_SECRET` lives in this
   site's server env and is used only from webhook/function code — never in
   browser-delivered JavaScript, page source, or client-side config.

## The contracts

Nine contracts hold this site to the studio and to itself. Each one, in full
and word for word, is in `docs/contracts.md` (moved there on 6 Oct 2026,
studio #1116, so every session stops loading all of them). Read the one your
change touches before you build it, and add a new contract there with one
line here.

- **Help** (#136, #166): `/help/` renders the studio's `docs/help/` and
  nothing about it is hand-listed. A studio outage never breaks a deploy,
  every corpus fetch has a deadline, and a guide's text lives on one URL.
- **Resources** (#159, #745): one article per useful learning, bound to
  `data/learnings.json` both ways. Articles declare the product names they
  use in `names:`, checked against `data/studio-strings.json`.
- **Assets** (#169): css, js and fonts are named after their contents, and
  every reference goes through the `asset` filter. Images are deliberately
  not hashed.
- **Scripts** (#170): every `<script src>` carries `defer` or `async`.
- **Typeahead** (#241): the scan field's suggestions go through one
  function, `company-suggest`, which forwards only the typed characters.
  Every failure is no list.
- **Price** (#542): `PLANS` in `create-checkout-session.js` is the only place
  either price is written. A plan the table does not hold is monthly, and
  monthly writes nothing.
- **Demo** (#767): `/demo/` is the studio's tour captured by
  `npm run demo:capture`, and every sentence on it is one the studio says.
- **Voice** (#640): the humanizer standard. `npm test` is red on a strong
  tell anywhere and on a dash count past its ceiling in `tools/humanize.js`.
- **Language** (#114, #535): the English sentence is the catalogue key,
  English is a no-op byte for byte, and the browser's language nudges but
  never redirects.

**Keep this file small.** A contract's detail goes in `docs/contracts.md`
and a ship note in the studio's `ROADMAP.md`, never here.

  heard of a catalogue.
- **Nothing counts sentences, pages, languages or editions.** Adding a language
  is one JSON file plus its literal require; adding a page to the funnel is a
  `pagination:` block and its sentences wrapped; a help edition arrives from
  the studio with nobody editing this repo. Any of them can only turn the suite
  red by being stale, unreadable, dead-linked or past a search budget — the
  #131 rule.

## The sign-off

When the deliverable is shipped, end the thread with exactly this shape and
nothing after it:

> ✅ **Shipped:** one line on what now works that didn't.
> 🚀 **Live:** the commit on `main`, and the fetch of the live page that
> proves it is being served — the actual response, not "should be". If it
> is deliberately not live, say what it waits on and who owes it.
> 📝 **Updated:** the docs updated, and any handover entries written for
> other lanes.
> ⏭ **Still open:** what this deliberately left undone, or "nothing".
> 🗄 **Archive this thread.** Opening message for the next thread in this
> lane:
>
> ```
> WEBSITE — <next deliverable>
> Read HANDOVER-website-funnel.md in prospektor-ai/studio, and CLAUDE.md
> here, first. <Two or three sentences: what was just shipped, what this
> deliverable is, and where to start looking.>
> ```

The opening message must stand alone — the next thread has no memory of
this one. If the lane's queue is empty, say so and propose the next item
from the studio repo's ROADMAP.md instead of inventing one.
