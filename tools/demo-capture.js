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
async function signIn(page, helpers) {
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
  await page.goto(BASE);
  // Whatever fronts the studio is cleared the way the studio's own drives
  // clear it (`dev/drive-account.js`), then the cookie notice, so the shots
  // show the screen and nothing over it.
  await helpers.pastAccountCard(page);
  await helpers.pastFirstRunDeck(page);
  const consent = await page.locator('.ppsc-bar button.ppsc-btn-primary').count();
  if (consent) { await page.click('.ppsc-bar button.ppsc-btn-primary'); await page.waitForSelector('.ppsc-bar', { state: 'detached', timeout: 8000 }).catch(() => {}); }
  // The capture runs with no API key, so the shelf on Leads for you holds
  // simulated tiles that say so on their face. They are hidden BEFORE the tour
  // reaches that step, so the tour places its ring on the screen as shot; the
  // ring is on the ask box either way, and a visitor sees the box and the
  // sentence, never a placeholder company. The account nudge (a recovery
  // number and a passkey) is a fresh member's chore and goes the same way.
  await page.addStyleTag({ content: '#view-suggested .tiles, #shelf-task, #shelf-state, #account-nudge { display: none !important; }' });
  await page.waitForSelector('#tour:not(.hidden)', { timeout: 15000 });
  await page.waitForFunction(() => {
    const box = document.getElementById('start-doors')?.getBoundingClientRect();
    return Boolean(box && box.width && box.height);
  }, { timeout: 30000 });
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
    await signIn(page, helpers);
    fs.mkdirSync(SHOTS, { recursive: true });
    for (const stale of fs.readdirSync(SHOTS)) if (/^step-\d+\.png$/.test(stale)) fs.unlinkSync(path.join(SHOTS, stale));
    const total = await page.locator('#tour-dots i').count();
    if (total !== steps.length) throw new Error(`the page draws ${total} steps and the source parses ${steps.length}`);
    // What each step past the pitch must have drawn before it is read, the
    // drive's own list: Your network and Settings fetch before they draw.
    const DRAWN = { prep: '#prep-form', network: '.net-form', workspace: '#workspace-body .scard-title' };
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

module.exports = { everyLanguage };

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
