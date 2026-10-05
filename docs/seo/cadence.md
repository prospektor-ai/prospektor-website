# The SEO cadence

**Studio board #1085** (WEBSITE · ops), 5 October 2026. The operator's ask,
verbatim:

> *"I do want regular SEO updates - meaning optimizing for keywords that fits
> Prospektor's ICP search results. We should schedule daily blog posts, and do
> other activities such as weekly or monthly SEO and AI/ LLM optimization to help
> being found organically."*

Three scheduled runs carry it. Each one's Routine prompt is a single line that
points here, so **this file is the instruction**: change the cadence by editing
it, never by editing a Routine. Every run writes its outcome to
`docs/seo/publishing-log.md`, which is the record. A run that leaves only a
conversation behind has done nothing (#293).

The Routines fire into the Prospektor project thread *Learn the whole Prospektor
project* (`session_01QTZrQH4NiEPDvQTr6jmGDd`), because a private project cannot
create a Routine that starts a fresh session each time. Each run posts its
result there in one reply. Archiving that thread stops all three.

| Run · Routine | When (UTC) | What it ships |
|---|---|---|
| **Daily article** · `trig_01QaYgUjeQ84eQ1zLw1q21GY` | every day, 08:50 | one article on `/resources/`, live |
| **Weekly SEO pass** · `trig_01TKrfPUS1YDkp2qEGzhFVVp` | Mondays, 06:45 | fixes from the audit, a week of queued topics, one refreshed article |
| **Monthly AI search pass** · `trig_01VupQAS8n6cnFcgkFSZEVJs` | the 1st, 05:40 | the site made easy for answer engines to read and cite |

## Rules every run keeps

- **Setup.** Repos `prospektor-ai/prospektor-website` (`main` is production,
  no staging) and `prospektor-ai/studio` (research source and board). Clone
  either if it is missing; pull `main`; `npm install` if `node_modules` is
  missing. Read this repo's `CLAUDE.md`, `docs/seo/project-facts.md` and this
  file before acting.
- **Who we write for.** Founders and heads of sales at B2B companies doing
  founder-led or early-team outbound, and agencies that prospect for clients.
  Prospektor tells them who to approach and what to send. The searches worth
  winning are theirs: founder-led sales, cold outreach and cold email, account
  and prospect research, defining an ICP, who to approach, what to send, call
  prep, warm intros, AI tools for sales research as a category. Long-tail,
  intent-bearing queries beat head terms.
- **One article per learning.** `/resources/` is bound to `data/learnings.json`
  and `npm test` enforces it both ways. A new topic needs a real ledger row,
  promoted from the studio's `docs/research/growth-playbook.md` (the parts not
  yet in the ledger) or another file under the studio's `docs/research/`.
  Defend `distinct_from` against the named existing articles by reading them.
- **True or absent.** No invented fact, customer, number or quote; a quote
  traces to a ledger row. No competitor named, no price but our own
  (`project-facts.md`). Voice is the humanizer standard, and `npm test` is red
  on a strong tell.
- **Live means asked of production.** Push to `main` (`git pull --rebase`
  first, retry up to four times with 2/4/8/16 s backoff), then fetch the
  changed page on `https://prospektor.ai` and confirm the change is served.
- **The board.** These runs are exempt from the studio `BOARD.md` Claim and
  Close rules, the way the hourly sweep is: a row a day would bury the board.
  Anything needing a studio build or the operator becomes one row there
  (`npm run id`, pushed to `claude/prospektor-partner-studio-9aj0iy`).
- **Never** send an email or post anywhere, delete or 301 a live URL, touch
  `/terms/`, `/privacy/` or `/dpa/`, or write an address, key or token into a
  repo. Never end a run with nothing committed: at least a log entry saying
  exactly what blocked it.

## Daily article

1. If `docs/seo/gsc-latest.md` exists, run `npm run gsc:opportunities` and
   `npm run gsc:cannibals`. An opportunity that beats the queue joins it and is
   today's topic.
2. Otherwise take the top `queued` item in `content-queue.json`. If none is
   queued, add one under the rules above.
3. Follow `.claude/skills/publish-article/SKILL.md` step by step, except its
   board claim (see *The board*). Read the studio's
   `.claude/skills/style/SKILL.md` before writing.
4. A thin page is worse than none. If no good article can be written today, do
   the top queued `maintenance` item's `first_action` instead and log why.
5. `npm test`, `npm run build`, `npm run og`; update the queue item's status and
   append the log line (date, URL, keyword, ledger id) in the same commit; push;
   confirm the URL answers 200 with the title.

## Weekly SEO pass

1. **Measure.** `node tools/seo-audit.js` against production and `npm run audit`.
   With `gsc-latest.md`: `npm run gsc:report`, `gsc:opportunities`,
   `gsc:cannibals`. Without it, log that `GSC_SERVICE_ACCOUNT_KEY` is still
   unset (studio board #135), so keyword positions are unmeasured.
2. **Fix** what is safe without the operator: titles, descriptions, headings,
   internal links, canonicals, the sitemap, structured data. Work the queued
   `maintenance` items.
3. **Plan the week.** At least seven `queued` articles in `content-queue.json`,
   each with a target keyword, the ledger row it will carry and a defended
   `distinct_from`.
4. **Refresh one older article** whose facts or links drifted
   (`npm run resources:coverage`, `npm run learnings`), or merge two that compete
   for one query.
5. `npm test`, `npm run build`, log, push, confirm.

## Monthly AI search pass

The goal: when a buyer asks ChatGPT, Claude, Perplexity or Google's AI answers
how to find who to approach or what to send, prospektor.ai is a page those
systems can read, trust and cite.

1. **Ask the engines.** With web search, put the same ten buyer questions every
   month (keep the list in the log) and record which sources are cited and
   whether prospektor.ai appears, so months compare.
2. **Make the site easy to cite.** `/llms.txt` (`src/llms.njk`) is accurate and
   lists every live article; robots lets GPTBot, ClaudeBot, PerplexityBot and
   Google-Extended in unless a written reason says otherwise; structured data
   validates (Organization, the product with the real price, FAQPage where a page
   has FAQs, Article on articles); each key page and article opens with a plain
   two-sentence answer to the question it targets.
3. **Feed the queue** with the questions no article answers yet.
4. `npm test`, `npm run build`, log, push, confirm.
