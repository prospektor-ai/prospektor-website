#!/usr/bin/env node
'use strict';
// `npm run demo:capture` — the clickable demo's screens, read off the studio (#767).
//
// The operator's ask, 18 Sep 2026: *"We should also have a clickable demo like
// this: https://app.storylane.io/share/7dnsrqniygbj"*. `/demo/` is that: the
// real screens, one element lit per step, one sentence, Next. Nothing on it is
// written here. The studio's one-minute tour (`TOUR_STEPS` in `public/studio.js`,
// reshaped by #766 into three chapters) is the one source: this tool starts
// the studio from a checkout beside this repo the way `dev/drive-tour.js`
// does, signs in through the dev door, walks the tour step by step over the
// example pitch, and for every step writes down what the tour showed: the
// screen (a PNG under `src/assets/img/demo/`), where the ring sat (as
// fractions of the screen, so the page can scale it), the card's title and
// sentence in every language the studio holds them in, the chapter, and the
// names the step declares. `data/demo.json` is the result, stamped with the
// studio commit it was read from.
//
// Why a capture and not a public door on the studio, said once. ROADMAP.md
// #766 recommended serving the demo from the studio itself over the example
// workspace. There is no example workspace: the example is a front-end
// constant (`public/example-pitch.js`) drawn inside a signed-in member's own
// shell, and the shell renders no screen without a session. A demo door is
// therefore a new anonymous surface on the product's auth layer, which is a
// studio row with a security pass, not a website page. What (b) was for was
// rot: a demo that keeps showing a screen the product no longer has. That is
// held here another way. Every sentence this file writes is a `t('…')` string
// in the studio, so it is in `data/studio-strings.json`, and
// `test/demo.test.js` fails by name the day `npm run strings:snapshot` brings
// back a catalogue that no longer says one of them. A tour rewrite reaches
// this repo as a red test naming `npm run demo:capture`, the same lag and the
// same catch as the articles' names (#745).
//
// An authoring step, never a build step: the Netlify build must not need a
// browser or a second checkout (`tools/og.js` is the precedent). Commit the
// PNGs and the JSON. The PNGs live under `/assets/img/`, which the asset
// contract (#169) leaves unhashed on purpose, so a re-capture rewrites them
// in place and a day's cache picks them up.
//
//   npm run demo:capture                    reads ../studio
//   npm run demo:capture -- /path/to/studio reads that checkout
//   STUDIO_DIR=/path/to/studio npm run demo:capture

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'demo.json');
const SHOTS = path.join(ROOT, 'src', 'assets', 'img', 'demo');
const PORT = Number(process.env.DEMO_PORT || 8981);
const BASE = `http://localhost:${PORT}`;
// The workspace the shots show is the example's own seller (`EXAMPLE_SELLER`
// in the studio's `public/example-pitch.js`): Ledgerpost pitching Harborline
// Freight, so the name in the rail and the pitch on the screen agree. The
// dev door names the member after the address's local part, capitals kept.
const SELLER = 'Ledgerpost';
const EMAIL = 'Mara@ledgerpost.example';
// The screen a demo visitor looks at. 1280 wide is the laptop the studio's own
// page-speed inventory measures on; 800 tall keeps every ring inside the shot.
const VIEWPORT = { width: 1280, height: 800 };

/** The studio checkout to read: the argument, `STUDIO_DIR`, or the sibling directory. */
function studioDir(args) {
  const given = args.find(a => !a.startsWith('--')) || process.env.STUDIO_DIR || path.join(ROOT, '..', 'studio');
  return path.resolve(given);
}

function commitOf(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { stdio: 'pipe' }).toString().trim(); }
  catch { return null; }
}

/** The studio's catalogues, `{ es: {…}, de: {…}, nl: {…} }`: the English sentence is the key there too. */
function catalogues(dir) {
  const out = {};
  const folder = path.join(dir, 'public', 'strings');
  if (!fs.existsSync(folder)) return out;
  for (const name of fs.readdirSync(folder)) {
    if (!name.endsWith('.json')) continue;
    out[name.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
  }
  return out;
}

/** One sentence in every language the studio holds it in; English first, always. */
const everyLanguage = (cats, english) => {
  const out = { en: english };
  for (const [code, table] of Object.entries(cats)) if (typeof table[english] === 'string' && table[english]) out[code] = table[english];
  return out;
};

async function startStudio(dir, dataDir) {
  const server = spawn(process.execPath, [path.join(dir, 'dev', 'server.js')], {
    cwd: dir,
    env: {
      ...process.env,
      PORT: String(PORT),
      SESSION_SECRET: 'demo-capture-secret-demo-capture-secret',
      DEV_AUTH: '1',
      ONBOARDING_OPEN: '1',
      ONBOARDING_ALLOWED: '@ledgerpost.example',
      STUDIO_FORCE_LOCAL_STORE: '1',
      STUDIO_DATA_DIR: dataDir,
      ANTHROPIC_API_KEY: '',
      STUDIO_TOUR_OFF: '',
      CONTEXT: 'dev',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', chunk => process.env.DEMO_VERBOSE && process.stderr.write(`[studio] ${chunk}`));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${BASE}/api/me`)).ok) return server; } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  server.kill();
  throw new Error('the studio dev server never came up');
}

const post = (page, url, body) => page.evaluate(([u, b]) =>
  fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()), [url, body]);

/** The way `dev/drive-tour.js` reaches the tour: a fresh member, a settled workspace, the studio itself. */
async function signIn(page, helpers, dir, dataDir) {
  await page.goto(BASE);
  await page.fill('#dev-email', EMAIL);
  await page.click('#dev-go');
  await page.waitForSelector('#view-onboard:not(.hidden)', { timeout: 15000 });
  await post(page, '/api/onboarding/create', { company: SELLER, website: 'ledgerpost.example' });
  await post(page, '/api/setup', { answers: {}, done: true });
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    const state = await page.evaluate(() => fetch('/api/first-run').then(r => r.json())).catch(() => null);
    if (state && state.status !== 'pending') break;
    await page.waitForTimeout(500);
  }
  await post(page, '/api/first-run', { spent: true }).catch(() => {});
  await seedShelf(page, dir, dataDir);
  await page.goto(BASE);
  // Whatever fronts the studio is cleared the way the studio's own drives
  // clear it (`dev/drive-account.js`), then the cookie notice, so the shots
  // show the screen and nothing over it.
  await helpers.pastAccountCard(page);
  await helpers.pastFirstRunDeck(page);
  const consent = await page.locator('.ppsc-bar button.ppsc-btn-primary').count();
  if (consent) { await page.click('.ppsc-bar button.ppsc-btn-primary'); await page.waitForSelector('.ppsc-bar', { state: 'detached', timeout: 8000 }).catch(() => {}); }
  // The capture runs with no API key, so Counterprospekt's competitor reading
  // never lands (its note, `#rivals-slot .rank-note`; since the studio's #1103
  // the slot itself holds the step's anchor, the add field, so it stays up).
  // It is hidden BEFORE the tour reaches that step, so the tour places its
  // ring on the screen as shot. The account nudge (a recovery number and a
  // passkey) is a fresh member's chore and goes the same way. The shelf on
  // Leads for you, and Home's own row of three, are no longer hidden (#1156):
  // `seedShelf` below gives them the example's own leads before the tour opens.
  await page.addStyleTag({ content: '#rivals-slot .rank-note, #shelf-task, #account-nudge { display: none !important; }' });
  // Since the studio's #1097 the tour never opens on its own: it is the last
  // line of the setup card on Home, and it opens when that line is pressed.
  // The studio's own `dev/drive-tour.js` opens it the same way.
  await page.waitForSelector('#segments button[data-view="start"]', { timeout: 15000 });
  await page.click('#segments button[data-view="start"]');
  await page.waitForSelector('#view-start:not(.hidden)', { timeout: 15000 });
  await page.waitForSelector('#home-setup #home-tour', { state: 'visible', timeout: 15000 });
  await page.click('#home-tour');
  await page.waitForSelector('#tour:not(.hidden)', { timeout: 15000 });
  // Step 1's anchor is the ask box on Home since the studio's #877 took the
  // doors away; the studio's own `dev/drive-tour.js` waits on the same box.
  await page.waitForFunction(() => {
    const box = document.getElementById('start-ask-form')?.getBoundingClientRect();
    return Boolean(box && box.width && box.height);
  }, { timeout: 30000 });
}

/*
 * Leads for you, with leads on it (#1156).
 *
 * The capture runs with no API key, so the setup search fills the shelf with
 * simulated tiles whose names are bracketed gaps (*[a company you would not
 * have thought of]*), and #767 hid them, which left step 2 of `/demo/` a blank
 * strip at the one step meant to sell who to chase. The shelf the shots show
 * is seeded instead from the example's own invented world: the three
 * lookalikes `public/example-pitch.js` draws under Harborline Freight, which
 * are exactly the companies Leads for you would hold for Ledgerpost. They are
 * written onto the capture's own throwaway workspace through the studio's
 * `lib/shelf.js`, so the tiles are the product's rendering of the product's
 * words: the name, the fit and the one-line why are all the studio's, and
 * nothing here invents a company. The studio's own rule holds too: those
 * names stay invented, and `test/buildPrompt.test.js` there checks it.
 */
async function seedShelf(page, dir, dataDir) {
  // The store reads its root off the environment when it loads, so the
  // capture's process is pointed at the dev server's data directory first.
  process.env.STUDIO_DATA_DIR = dataDir;
  process.env.STUDIO_FORCE_LOCAL_STORE = '1';
  const { default: example } = await import(pathToFileURL(path.join(dir, 'public', 'example-pitch.js')).href);
  const shelf = await import(pathToFileURL(path.join(dir, 'lib', 'shelf.js')).href);
  const leads = (example?.result?.lookalikes || [])
    .filter(l => l && l.name && !/^\[/.test(l.name) && l.why)
    .map(l => ({ name: l.name, website: l.website || null, score: l.similarity ?? null, why: l.why, facts: [] }));
  if (leads.length < 3) throw new Error(`the example pitch holds ${leads.length} lookalikes to seed Leads for you with, and the screen is drawn for three`);
  const me = await page.evaluate(() => fetch('/api/me').then(r => r.json()));
  const clientId = me?.client?.id;
  if (!clientId) throw new Error('could not read the capture workspace\'s id off /api/me');
  // The setup search's own refill lands first, so nothing simulated lands over the seed.
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    const seen = await page.evaluate(() => fetch('/api/suggestions').then(r => r.json())).catch(() => null);
    if (seen && !seen.refilling && !seen.preparing) break;
    await page.waitForTimeout(500);
  }
  const written = await shelf.updateShelf(clientId, current => shelf.addProspects({ ...current, prospects: [], refill: null }, leads, { source: 'example' }).record);
  const names = (written?.prospects || []).map(p => p.name);
  if (names.length !== leads.length) throw new Error(`seeded ${names.length} of ${leads.length} example leads onto the shelf`);
  console.log(`  Leads for you seeded from the example: ${names.join(', ')}`);
}

/** Wait until the ring and the card have stopped moving (the drive's `settled`). */
async function settled(page) {
  let previous = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const now = await page.evaluate(() => {
      const box = document.getElementById('tour-ring').getBoundingClientRect();
      const card = document.querySelector('#tour .tour-card').getBoundingClientRect();
      return [box.left, box.top, box.width, box.height, card.left, card.top, card.width, card.height].map(Math.round).join(',');
    });
    if (now === previous) return;
    previous = now;
    await page.waitForTimeout(100);
  }
}

/** What the tour is showing right now: the card's words and where the ring is, in fractions of the screen. */
const reading = page => page.evaluate(() => {
  const ring = document.getElementById('tour-ring');
  const box = ring.getBoundingClientRect();
  const ringed = !ring.classList.contains('hidden') && box.width > 0 && box.height > 0;
  const chapter = document.querySelector('#tour-count .tour-chapter');
  const chapterId = chapter ? [...chapter.classList].map(c => (c.match(/^verb-(.+)$/) || [])[1]).find(Boolean) || null : null;
  const round = n => Math.round(n * 10000) / 10000;
  return {
    count: document.getElementById('tour-count').textContent.trim(),
    chapter: chapterId,
    title: document.getElementById('tour-title').textContent.trim(),
    body: document.getElementById('tour-body').textContent.trim(),
    view: [...document.querySelectorAll('section[id^="view-"]')].find(s => !s.classList.contains('hidden'))?.id.replace(/^view-/, '') || null,
    ring: ringed ? {
      x: round(box.left / window.innerWidth), y: round(box.top / window.innerHeight),
      w: round(box.width / window.innerWidth), h: round(box.height / window.innerHeight),
    } : null,
  };
});

/*
 * The screens other pages show, by name rather than by step number (#1061).
 * The integration pages put a Prospektor screen beside their copy, and they
 * used to point at `step-NN.png`: when the tour went from ten steps to eight,
 * `step-10.png` stopped existing and `step-06.png` turned from the pitch deck
 * into the call form under a caption that still said deck. So the screens a
 * page names are written here under a name that says what they show,
 * `screen-<name>.png`, from whichever step happens to open that view, and the
 * pitch's tabs are opened in turn while the tour stands on the example pitch.
 * `test/demo.test.js` holds every page to a file this list writes.
 */
// Since the studio's #1153 the pitch has three tabs (The pitch, Who to write to,
// Why them) and the formats sit behind the pitch card's own menu, so a named
// screen is a tab and, on the pitch tab, the format the menu shows.
const NAMED_TABS = { 'fit-thesis': ['why'], 'decision-makers': ['who'], 'pitch-deck': ['pitch', 'asset:deck'], 'cold-email': ['pitch', 'asset:emailSequence'] };
const NAMED_VIEWS = { prep: 'meeting-prep', workspace: 'settings' };
const NAMED = [...Object.keys(NAMED_TABS), ...Object.values(NAMED_VIEWS)];

async function shootNamed(page, view, stepFile) {
  if (NAMED_VIEWS[view]) fs.copyFileSync(path.join(SHOTS, stepFile), path.join(SHOTS, `screen-${NAMED_VIEWS[view]}.png`));
  if (view !== 'result') return;
  const was = await page.evaluate(() => document.querySelector('#result-tabs button.active, #result-tabs button[aria-selected="true"]')?.dataset.tab || null);
  for (const [name, [tab, format]] of Object.entries(NAMED_TABS)) {
    const hit = await page.evaluate(([t, f]) => {
      const b = document.querySelector(`#result-tabs button[data-tab="${t}"]`);
      if (!b) return false;
      b.click();
      if (!f) return true;
      const pick = document.querySelector(`#result-panels .pitch-card:not(.hidden) .fmt-pick button[data-format="${f}"]`);
      if (pick) pick.click();
      return Boolean(pick);
    }, [tab, format || null]);
    if (!hit) throw new Error(`the example pitch has no ${format || tab} to shoot as screen-${name}.png`);
    await page.waitForTimeout(400);
    await shoot(page, path.join(SHOTS, `screen-${name}.png`));
  }
  if (was) await page.evaluate(t => document.querySelector(`#result-tabs button[data-tab="${t}"]`)?.click(), was);
  await page.waitForTimeout(300);
}

/** The screen with the tour's own overlay out of the way (the page draws its
 *  own ring and card), and without the dev server's own notices (`#banners`
 *  holds *No API key configured, so runs are simulated*, which is true of the
 *  capture and of nothing a visitor is looking at). */
async function shoot(page, file) {
  await page.evaluate(() => { for (const id of ['tour', 'banners']) document.getElementById(id).style.visibility = 'hidden'; });
  await page.waitForTimeout(50);
  await page.screenshot({ path: file, type: 'png', animations: 'disabled', caret: 'hide' });
  await page.evaluate(() => { for (const id of ['tour', 'banners']) document.getElementById(id).style.visibility = ''; });
}

async function main() {
  const dir = studioDir(process.argv.slice(2));
  const studioJs = path.join(dir, 'public', 'studio.js');
  const coverage = path.join(dir, 'dev', 'tour-coverage.js');
  if (!fs.existsSync(studioJs) || !fs.existsSync(coverage)) {
    console.error(`✗ ${dir} is not a studio checkout (no public/studio.js and dev/tour-coverage.js).\n  Pass it: npm run demo:capture -- /path/to/studio\n  Nothing was changed.`);
    process.exit(1);
  }
  // The steps as the studio's own check reads them (#744): their views, tabs,
  // anchors and the names each declares. The words are read off the screen
  // below, in the studio's own rendering, so a `t()` the parser cannot see
  // still lands right.
  const { parseTourSteps } = await import(pathToFileURL(coverage).href);
  const helpers = await import(pathToFileURL(path.join(dir, 'dev', 'drive-account.js')).href);
  const steps = parseTourSteps(fs.readFileSync(studioJs, 'utf8'));
  if (steps.length < 5) throw new Error(`only ${steps.length} tour steps parsed out of public/studio.js`);
  const cats = catalogues(dir);
  const commit = commitOf(dir);
  console.log(`Reading the tour in ${dir} (${commit ? commit.slice(0, 7) : 'no git'}): ${steps.length} steps, catalogues ${Object.keys(cats).join(', ') || 'none'}`);

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-demo-capture-'));
  const server = await startStudio(dir, dataDir);
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await signIn(page, helpers, dir, dataDir);
    fs.mkdirSync(SHOTS, { recursive: true });
    for (const stale of fs.readdirSync(SHOTS)) if (/^(step-\d+|screen-[a-z-]+)\.png$/.test(stale)) fs.unlinkSync(path.join(SHOTS, stale));
    const total = await page.locator('#tour-dots i').count();
    if (total !== steps.length) throw new Error(`the page draws ${total} steps and the source parses ${steps.length}`);
    // What each step past the pitch must have drawn before it is read, the
    // drive's own list: Counterprospekt, Your network, the Library and
    // Settings fetch before they draw.
    const DRAWN = { counter: '#counter-company', network: '#network-imports-card:not(.hidden)', prep: '#prep-form', library: '#saved-list', workspace: '#workspace-body .scard-title' };
    const out = [];
    for (let i = 0; i < total; i += 1) {
      if (i > 0) await page.click('#tour-next');
      const step = steps[i];
      if (DRAWN[step.view]) { await page.waitForSelector(DRAWN[step.view], { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(400); }
      await settled(page);
      await page.waitForTimeout(250);
      const seen = await reading(page);
      if (seen.title !== step.title || seen.body !== step.body) {
        throw new Error(`step ${i + 1}: the screen says ${JSON.stringify(seen.title)} / ${JSON.stringify(seen.body)} and the source says ${JSON.stringify(step.title)} / ${JSON.stringify(step.body)}`);
      }
      const file = `step-${String(i + 1).padStart(2, '0')}.png`;
      await shoot(page, path.join(SHOTS, file));
      out.push({
        n: i + 1,
        chapter: seen.chapter,
        view: seen.view,
        tab: step.tab || null,
        image: `/assets/img/demo/${file}`,
        ring: seen.ring,
        title: everyLanguage(cats, step.title),
        body: everyLanguage(cats, step.body),
        names: step.names,
      });
      await shootNamed(page, seen.view, file);
      console.log(`  ${String(i + 1).padStart(2)}  ${seen.chapter || 'start '}  ${seen.view}${step.tab ? ' · ' + step.tab : ''}  ${seen.ring ? 'ringed' : 'no ring'}  ${step.title}`);
    }
    // The chapters, in the studio's order and names, off the opening card.
    await page.click('#tour-back').catch(() => {});
    const chapters = [...new Set(out.map(s => s.chapter).filter(Boolean))].map(id => {
      const label = { find: 'Find', engage: 'Engage', teach: 'Teach' }[id] || id;
      return { id, name: everyLanguage(cats, label), first: out.find(s => s.chapter === id).n };
    });
    fs.writeFileSync(OUT, JSON.stringify({
      '//': 'The clickable demo (#767): the studio\'s one-minute tour, read off the real screens by `npm run demo:capture` with the studio checked out beside this repo. Do not hand-edit. Every title and body is a string the studio says (`data/studio-strings.json`); `test/demo.test.js` holds the two together.',
      capturedAt: new Date().toISOString().slice(0, 10),
      source: { repo: 'prospektor-ai/studio', file: 'public/studio.js#TOUR_STEPS', commit },
      viewport: VIEWPORT,
      chapters,
      steps: out,
    }, null, 2) + '\n');
    if (errors.length) console.warn(`  page errors while walking:\n    ${errors.join('\n    ')}`);
    console.log(`ok\n  ${out.length} steps, ${chapters.length} chapters\n  → ${path.relative(process.cwd(), OUT)}\n  → ${path.relative(process.cwd(), SHOTS)}/`);
  } finally {
    await browser.close().catch(() => {});
    server.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

module.exports = { everyLanguage, NAMED };

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
